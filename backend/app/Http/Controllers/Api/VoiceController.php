<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreVoiceSignalRequest;
use App\Http\Resources\VoicePeerResource;
use App\Http\Resources\VoiceSignalResource;
use App\Models\Channel;
use App\Models\Server;
use App\Models\ServerMember;
use App\Models\User;
use App\Models\VoicePeer;
use App\Models\VoiceSignal;
use App\Services\ServerPermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class VoiceController extends Controller
{
    public function __construct(private readonly ServerPermissionService $permissions)
    {
    }

    public function join(Request $request, Channel $channel): AnonymousResourceCollection
    {
        $user = $request->user();
        $this->ensureMember($request, $channel);
        $this->purgeStalePeers($channel);
        VoiceSignal::query()
            ->where('created_at', '<', now()->subHour())
            ->orderBy('id')
            ->limit(500)
            ->delete();

        $forceMuted = $this->permissions->isDenied($channel->server, $user, 'deny_voice');

        VoicePeer::query()->updateOrCreate(
            [
                'room_id' => $channel->id,
                'user_id' => $user->id,
            ],
            [
                'sharing_screen' => false,
                'camera_on' => false,
                'force_muted' => $forceMuted,
                'last_seen_at' => now(),
            ],
        );

        $peers = VoicePeer::query()
            ->with('user')
            ->where('room_id', $channel->id)
            ->where('user_id', '!=', $user->id)
            ->where('last_seen_at', '>=', now()->subSeconds(VoicePeer::STALE_SECONDS))
            ->get();

        return VoicePeerResource::collection($peers);
    }

    public function leave(Request $request, Channel $channel): JsonResponse
    {
        $this->ensureMember($request, $channel);

        $deleted = VoicePeer::query()
            ->where('room_id', $channel->id)
            ->where('user_id', $request->user()->id)
            ->delete();

        if ($deleted === 0) {
            abort(Response::HTTP_NOT_FOUND, 'Você não está na chamada de voz.');
        }


        return response()->json(['ok' => true]);
    }

    public function heartbeat(Request $request, Channel $channel): JsonResponse
    {
        $this->ensureMember($request, $channel);

        $peer = VoicePeer::query()
            ->where('room_id', $channel->id)
            ->where('user_id', $request->user()->id)
            ->first();

        if (! $peer) {
            abort(Response::HTTP_NOT_FOUND, 'Você não está na chamada de voz.');
        }

        $forceMuted = $peer->force_muted || $this->permissions->isDenied($channel->server, $request->user(), 'deny_voice');

        $peer->update([
            'last_seen_at' => now(),
            'force_muted' => $forceMuted,
        ]);

        return response()->json([
            'ok' => true,
            'force_muted' => $forceMuted,
        ]);
    }

    public function peers(Request $request, Channel $channel): AnonymousResourceCollection
    {
        $this->ensureMember($request, $channel);
        $this->purgeStalePeers($channel);

        $peers = VoicePeer::query()
            ->with('user')
            ->where('room_id', $channel->id)
            ->where('user_id', '!=', $request->user()->id)
            ->where('last_seen_at', '>=', now()->subSeconds(VoicePeer::STALE_SECONDS))
            ->get();

        return VoicePeerResource::collection($peers);
    }

    public function presence(Request $request, Server $server): JsonResponse
    {
        $this->ensureServerMember($request, $server);
        $this->purgeStaleForServer($server);

        $channelIds = $server->channels()->orderBy('position')->pluck('id');

        $peers = VoicePeer::query()
            ->with('user')
            ->whereIn('room_id', $channelIds)
            ->where('last_seen_at', '>=', now()->subSeconds(VoicePeer::STALE_SECONDS))
            ->orderBy('id')
            ->get()
            ->groupBy(fn (VoicePeer $peer) => (int) $peer->room_id);

        $payload = $channelIds->map(static function (mixed $channelId) use ($peers): array {
            $id = (int) $channelId;

            return [
                'channel_id' => $id,
                'peers' => VoicePeerResource::collection($peers->get($id, collect()))->resolve(),
            ];
        });

        return response()->json($payload->values());
    }

    public function updateScreen(Request $request, Channel $channel): JsonResponse
    {
        $this->ensureMember($request, $channel);

        $request->validate([
            'sharing_screen' => ['required', 'boolean'],
            'camera_on' => ['sometimes', 'boolean'],
        ]);

        if ($request->boolean('sharing_screen')) {
            $this->permissions->assertNotDenied(
                $channel->server,
                $request->user(),
                'deny_screen',
                'Você não tem permissão para transmitir tela neste servidor.',
            );
        }

        if ($request->exists('camera_on') && $request->boolean('camera_on')) {
            $this->permissions->assertNotDenied(
                $channel->server,
                $request->user(),
                'deny_camera',
                'Você não tem permissão para ligar a câmera neste servidor.',
            );
        }

        $fields = [
            'sharing_screen' => $request->boolean('sharing_screen'),
            'last_seen_at' => now(),
        ];
        if ($request->exists('camera_on')) {
            $fields['camera_on'] = $request->boolean('camera_on');
        }

        $updated = VoicePeer::query()
            ->where('room_id', $channel->id)
            ->where('user_id', $request->user()->id)
            ->update($fields);

        if (! $updated) {
            abort(Response::HTTP_NOT_FOUND, 'Você não está na chamada de voz.');
        }

        return response()->json(['ok' => true]);
    }

    public function kickFromCall(Request $request, Channel $channel, User $user): JsonResponse
    {
        $actor = $request->user();
        $this->ensureMember($request, $channel);
        $this->permissions->assertCan(
            $channel->server,
            $actor,
            'can_kick_call',
            'Você não tem permissão para expulsar da chamada.',
        );

        if (! $this->permissions->canModerateTarget($channel->server, $actor, $user)) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'Você não pode expulsar esta pessoa da chamada.');
        }

        $peer = VoicePeer::query()
            ->where('room_id', $channel->id)
            ->where('user_id', $user->id)
            ->first();

        if (! $peer) {
            abort(Response::HTTP_NOT_FOUND, 'Esta pessoa não está na chamada.');
        }

        $this->sendModeration($channel, $actor->id, $user->id, 'kick');
        $peer->delete();

        return response()->json(['ok' => true]);
    }

    public function muteInCall(Request $request, Channel $channel, User $user): JsonResponse
    {
        $actor = $request->user();
        $this->ensureMember($request, $channel);
        $this->permissions->assertCan(
            $channel->server,
            $actor,
            'can_mute_call',
            'Você não tem permissão para mutar nesta chamada.',
        );

        if (! $this->permissions->canModerateTarget($channel->server, $actor, $user)) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'Você não pode mutar esta pessoa.');
        }

        $request->validate([
            'muted' => ['required', 'boolean'],
        ]);

        $peer = VoicePeer::query()
            ->where('room_id', $channel->id)
            ->where('user_id', $user->id)
            ->first();

        if (! $peer) {
            abort(Response::HTTP_NOT_FOUND, 'Esta pessoa não está na chamada.');
        }

        $muted = $request->boolean('muted')
            || $this->permissions->isDenied($channel->server, $user, 'deny_voice');

        $peer->update(['force_muted' => $muted]);
        $this->sendModeration($channel, $actor->id, $user->id, $muted ? 'mute' : 'unmute');

        return response()->json([
            'ok' => true,
            'force_muted' => $muted,
        ]);
    }

    public function signals(Request $request, Channel $channel): AnonymousResourceCollection
    {
        $this->ensureMember($request, $channel);

        $query = VoiceSignal::query()
            ->where('room_id', $channel->id)
            ->where('to_user_id', $request->user()->id)
            ->orderBy('id');

        if ($request->filled('after_id')) {
            $query->where('id', '>', (int) $request->query('after_id'));
        } else {
            $query->where('created_at', '>=', now()->subMinutes(5));
        }

        return VoiceSignalResource::collection($query->limit(100)->get());
    }

    public function sendSignal(StoreVoiceSignalRequest $request, Channel $channel): VoiceSignalResource
    {
        $this->ensureMember($request, $channel);
        $user = $request->user();
        $type = $request->validated('type');
        $payload = $request->validated('payload');

        if ($type === VoiceSignal::TYPE_SCREEN) {
            if (! empty($payload['sharing'])) {
                $this->permissions->assertNotDenied(
                    $channel->server,
                    $user,
                    'deny_screen',
                    'Você não tem permissão para transmitir tela neste servidor.',
                );
            }

            if (! empty($payload['camera'])) {
                $this->permissions->assertNotDenied(
                    $channel->server,
                    $user,
                    'deny_camera',
                    'Você não tem permissão para ligar a câmera neste servidor.',
                );
            }
        }

        $isTargetMember = ServerMember::query()
            ->where('server_id', $channel->server_id)
            ->where('user_id', $request->validated('to_user_id'))
            ->exists();

        if (! $isTargetMember) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'Destinatário inválido.');
        }

        $signal = VoiceSignal::query()->create([
            'room_id' => $channel->id,
            'from_user_id' => $user->id,
            'to_user_id' => $request->validated('to_user_id'),
            'type' => $type,
            'payload' => $payload,
        ]);

        return new VoiceSignalResource($signal);
    }

    private function sendModeration(Channel $channel, int $fromUserId, int $toUserId, string $action): void
    {
        VoiceSignal::query()->create([
            'room_id' => $channel->id,
            'from_user_id' => $fromUserId,
            'to_user_id' => $toUserId,
            'type' => VoiceSignal::TYPE_MODERATION,
            'payload' => ['action' => $action],
        ]);
    }

    private function ensureMember(Request $request, Channel $channel): void
    {
        $server = $channel->server;

        if ($server->isBannedUser($request->user()->id)) {
            abort(Response::HTTP_FORBIDDEN, 'Você foi expulso deste servidor.');
        }

        $isMember = ServerMember::query()
            ->where('server_id', $server->id)
            ->where('user_id', $request->user()->id)
            ->exists();

        if (! $isMember) {
            abort(Response::HTTP_FORBIDDEN, 'Você não é membro deste servidor.');
        }
    }

    private function ensureServerMember(Request $request, Server $server): void
    {
        if ($server->isBannedUser($request->user()->id)) {
            abort(Response::HTTP_FORBIDDEN, 'Você foi expulso deste servidor.');
        }

        if ($request->user()->isAdmin()) {
            return;
        }

        $isMember = ServerMember::query()
            ->where('server_id', $server->id)
            ->where('user_id', $request->user()->id)
            ->exists();

        if (! $isMember) {
            abort(Response::HTTP_FORBIDDEN, 'Você não é membro deste servidor.');
        }
    }

    private function purgeStaleForServer(Server $server): void
    {
        $channelIds = $server->channels()->pluck('id');

        VoicePeer::query()
            ->whereIn('room_id', $channelIds)
            ->where('last_seen_at', '<', now()->subSeconds(VoicePeer::STALE_SECONDS))
            ->delete();
    }

    private function purgeStalePeers(Channel $channel): void
    {
        VoicePeer::query()
            ->where('room_id', $channel->id)
            ->where('last_seen_at', '<', now()->subSeconds(VoicePeer::STALE_SECONDS))
            ->delete();
    }
}
