<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreServerRequest;
use App\Http\Requests\UpdateServerRequest;
use App\Http\Requests\VerifyServerRequest;
use App\Http\Resources\ServerMemberResource;
use App\Http\Resources\ServerResource;
use App\Models\Server;
use App\Models\ServerBan;
use App\Models\ServerMember;
use App\Models\User;
use App\Models\VoicePeer;
use App\Services\ServerCredentialService;
use App\Services\ServerPermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class ServerController extends Controller
{
    public function __construct(
        private readonly ServerCredentialService $credentials,
        private readonly ServerPermissionService $permissions,
    ) {
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        $userId = $request->user()->id;

        $servers = Server::query()
            ->withCount('members')
            ->whereHas('members', fn ($query) => $query->where('user_id', $userId))
            ->with(['members' => fn ($query) => $query->where('user_id', $userId)->with('assignedRole')])
            ->orderBy('name')
            ->get();

        return ServerResource::collection(
            $servers->map(function (Server $server) {
                $membership = $server->members->first();

                return new ServerResource($server, [
                    'membership_role' => $membership?->role,
                ]);
            }),
        );
    }

    public function store(StoreServerRequest $request): JsonResponse
    {
        $server = Server::query()->create([
            'name' => $request->validated('name'),
            'invite_code' => $this->credentials->generateUniqueInviteCode(),
            'password' => Hash::make($request->validated('password')),
            'owner_id' => $request->user()->id,
        ]);

        $this->credentials->addOwnerMembership($server, $request->user()->id);

        $server->channels()->create([
            'name' => 'geral',
            'position' => 0,
        ]);

        return (new ServerResource($server->load('channels'), [
            'membership_role' => ServerMember::ROLE_OWNER,
            'password' => $request->validated('password'),
        ]))
            ->response()
            ->setStatusCode(201);
    }

    public function update(UpdateServerRequest $request, Server $server): ServerResource|JsonResponse
    {
        $this->permissions->assertCan($server, $request->user(), 'can_manage_server', 'Somente o dono do servidor ou um admin pode editar o servidor.');

        $data = [];

        if ($request->filled('name')) {
            $data['name'] = $request->validated('name');
        }

        if ($request->filled('password')) {
            $data['password'] = Hash::make($request->validated('password'));
        }

        if ($data === []) {
            return new ServerResource($server, [
                'membership_role' => ServerMember::ROLE_OWNER,
            ]);
        }

        $server->update($data);

        return new ServerResource($server->fresh(), [
            'membership_role' => ServerMember::ROLE_OWNER,
            'password' => $request->validated('password'),
        ]);
    }

    public function verify(VerifyServerRequest $request): ServerResource
    {
        $user = $request->user();
        $server = Server::query()
            ->where('invite_code', strtoupper($request->validated('invite_code')))
            ->first();

        if (! $server || ! Hash::check($request->validated('password'), $server->password)) {
            throw ValidationException::withMessages([
                'password' => ['Código ou senha inválidos.'],
            ]);
        }

        if ($server->isBannedUser($user->id)) {
            throw ValidationException::withMessages([
                'password' => ['Você foi expulso deste servidor.'],
            ]);
        }

        $this->credentials->addMember($server, $user->id);

        $membership = ServerMember::query()
            ->with('assignedRole')
            ->where('server_id', $server->id)
            ->where('user_id', $user->id)
            ->first();

        return new ServerResource($server->load(['channels'])->loadCount('members'), [
            'membership_role' => $membership?->role,
        ]);
    }

    public function adminIndex(Request $request): AnonymousResourceCollection
    {
        $servers = Server::query()
            ->withCount('members')
            ->orderBy('name')
            ->get();

        return ServerResource::collection($servers);
    }

    public function members(Request $request, Server $server): AnonymousResourceCollection
    {
        $user = $request->user();
        $canList = $this->permissions->can($server, $user, 'can_manage_roles')
            || $this->permissions->can($server, $user, 'can_kick_server')
            || $this->permissions->can($server, $user, 'can_ban_server');

        if (! $canList) {
            abort(Response::HTTP_FORBIDDEN, 'Você não pode ver os membros deste servidor.');
        }

        $members = ServerMember::query()
            ->with(['user', 'assignedRole'])
            ->where('server_id', $server->id)
            ->orderBy('joined_at')
            ->get();

        return ServerMemberResource::collection($members);
    }

    public function kick(Request $request, Server $server, User $user): JsonResponse
    {
        $actor = $request->user();
        $this->permissions->assertCan($server, $actor, 'can_kick_server', 'Você não tem permissão para expulsar membros.');
        $this->assertModerationTarget($server, $actor, $user);

        DB::transaction(function () use ($server, $user): void {
            ServerMember::query()->where('server_id', $server->id)->where('user_id', $user->id)->delete();
            VoicePeer::query()->whereIn('room_id', $server->channels()->select('id'))->where('user_id', $user->id)->delete();
        });

        return response()->json(['message' => 'Membro removido do servidor. Ele pode entrar novamente com o convite.']);
    }

    private function assertModerationTarget(Server $server, User $actor, User $user): void
    {
        if (! $this->permissions->canModerateTarget($server, $actor, $user)) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'Você só pode moderar membros com cargo inferior ao seu.');
        }

        abort_unless($server->members()->where('user_id', $user->id)->exists(), 404, 'Membro não encontrado.');
    }

    public function ban(Request $request, Server $server, User $user): JsonResponse
    {
        $actor = $request->user();
        $this->permissions->assertCan($server, $actor, 'can_ban_server', 'Você não tem permissão para banir membros deste servidor.');
        $this->assertModerationTarget($server, $actor, $user);

        if ($user->id === $actor->id) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'Você não pode expulsar a si mesmo.');
        }

        if ($user->id === $server->owner_id) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'O dono do servidor não pode ser expulso.');
        }

        if ($user->isAdmin()) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'Administradores da plataforma não podem ser expulsos.');
        }

        DB::transaction(function () use ($server, $user, $actor): void {
            ServerMember::query()
                ->where('server_id', $server->id)
                ->where('user_id', $user->id)
                ->delete();

            VoicePeer::query()->whereIn('room_id', $server->channels()->select('id'))->where('user_id', $user->id)->delete();

            ServerBan::query()->updateOrCreate(
                [
                    'server_id' => $server->id,
                    'user_id' => $user->id,
                ],
                [
                    'banned_by' => $actor->id,
                    'banned_at' => now(),
                ],
            );
        });

        $rotated = $this->credentials->rotate($server->fresh());
        $membership = ServerMember::query()
            ->where('server_id', $server->id)
            ->where('user_id', $actor->id)
            ->first();

        return response()->json([
            'message' => 'Membro banido. Código e senha do servidor foram alterados.',
            'server' => (new ServerResource($server->fresh()->loadCount('members'), [
                'membership_role' => $membership?->role,
                'invite_code' => $rotated['invite_code'],
                'password' => $rotated['password'],
            ]))->resolve(),
        ]);
    }
}
