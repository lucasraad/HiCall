<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMessageRequest;
use App\Http\Resources\MessageResource;
use App\Models\Channel;
use App\Models\Message;
use App\Models\ServerMember;
use App\Services\ServerPermissionService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class MessageController extends Controller
{
    public function __construct(private readonly ServerPermissionService $permissions)
    {
    }
    public function index(Request $request, Channel $channel): AnonymousResourceCollection
    {
        $this->ensureMember($request, $channel);

        $query = Message::query()
            ->with('user')
            ->where('room_id', $channel->id)
            ->orderBy('id');

        if ($request->filled('after_id')) {
            $query->where('id', '>', (int) $request->query('after_id'));
        } else {
            $query->limit(50);
        }

        return MessageResource::collection($query->get());
    }

    public function store(StoreMessageRequest $request, Channel $channel): MessageResource
    {
        $this->ensureMember($request, $channel);
        $this->permissions->assertNotDenied(
            $channel->server,
            $request->user(),
            'deny_chat',
            'Você não tem permissão para falar no chat deste servidor.',
        );

        $message = Message::query()->create([
            'room_id' => $channel->id,
            'user_id' => $request->user()->id,
            'body' => $request->validated('body'),
        ]);

        return new MessageResource($message->load('user'));
    }

    private function ensureMember(Request $request, Channel $channel): void
    {
        $server = $channel->server;

        if ($server->isBannedUser($request->user()->id)) {
            abort(403, 'Você foi expulso deste servidor.');
        }

        $isMember = ServerMember::query()
            ->where('server_id', $server->id)
            ->where('user_id', $request->user()->id)
            ->exists();

        if (! $isMember) {
            abort(403, 'Você não é membro deste servidor.');
        }
    }
}
