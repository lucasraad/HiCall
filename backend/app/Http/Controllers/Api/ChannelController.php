<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreChannelRequest;
use App\Http\Requests\UpdateChannelRequest;
use App\Http\Resources\ChannelResource;
use App\Models\Channel;
use App\Models\Server;
use App\Models\ServerMember;
use App\Services\ServerPermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ChannelController extends Controller
{
    public function __construct(private readonly ServerPermissionService $permissions)
    {
    }

    public function index(Request $request, Server $server): AnonymousResourceCollection
    {
        $this->ensureMember($request, $server);

        $channels = $server->channels()->orderBy('position')->get();

        return ChannelResource::collection($channels);
    }

    public function store(StoreChannelRequest $request, Server $server): JsonResponse
    {
        $this->ensureMember($request, $server);
        $this->permissions->assertCan($server, $request->user(), 'can_create_channels', 'Você não tem permissão para criar canais neste servidor.');

        $position = ($server->channels()->max('position') ?? -1) + 1;

        $channel = $server->channels()->create([
            'name' => $request->validated('name'),
            'position' => $position,
        ]);

        return (new ChannelResource($channel))
            ->response()
            ->setStatusCode(201);
    }

    public function update(UpdateChannelRequest $request, Channel $channel): ChannelResource
    {
        $this->permissions->assertCan($channel->server, $request->user(), 'can_manage_server', 'Somente o dono do servidor ou um admin pode editar canais.');

        $channel->update([
            'name' => $request->validated('name'),
        ]);

        return new ChannelResource($channel->fresh());
    }

    public function destroy(Request $request, Channel $channel): JsonResponse
    {
        $server = $channel->server;
        $this->permissions->assertCan($server, $request->user(), 'can_manage_server', 'Somente o dono do servidor ou um admin pode excluir canais.');

        if ($server->channels()->count() <= 1) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'O servidor precisa ter pelo menos um canal.');
        }

        $channel->delete();

        return response()->json(null, Response::HTTP_NO_CONTENT);
    }

    private function ensureMember(Request $request, Server $server): void
    {
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
}
