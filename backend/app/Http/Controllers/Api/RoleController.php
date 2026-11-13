<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AssignMemberRoleRequest;
use App\Http\Requests\StoreRoleRequest;
use App\Http\Requests\UpdateRoleRequest;
use App\Http\Resources\RoleResource;
use App\Http\Resources\ServerMemberResource;
use App\Models\Role;
use App\Models\Server;
use App\Models\ServerMember;
use App\Models\User;
use App\Services\ServerPermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class RoleController extends Controller
{
    public function __construct(private readonly ServerPermissionService $permissions)
    {
    }

    public function index(Request $request, Server $server): AnonymousResourceCollection
    {
        $this->permissions->assertCanManageRoles($server, $request->user());

        $roles = Role::query()
            ->where('server_id', $server->id)
            ->orderByDesc('position')->orderBy('name')
            ->get();

        return RoleResource::collection($roles);
    }

    public function store(StoreRoleRequest $request, Server $server): JsonResponse
    {
        $this->permissions->assertCanManageRoles($server, $request->user());

        $role = $server->roles()->create($request->validated());

        return (new RoleResource($role))
            ->response()
            ->setStatusCode(201);
    }

    public function update(UpdateRoleRequest $request, Role $role): RoleResource
    {
        $this->permissions->assertCanManageRoles($role->server, $request->user());

        $role->update($request->validated());

        return new RoleResource($role->fresh());
    }

    public function destroy(Request $request, Role $role): JsonResponse
    {
        $this->permissions->assertCanManageRoles($role->server, $request->user());

        $role->delete();

        return response()->json(null, Response::HTTP_NO_CONTENT);
    }

    public function assign(AssignMemberRoleRequest $request, Server $server, User $user): ServerMemberResource
    {
        $actor = $request->user();
        $this->permissions->assertCanManageRoles($server, $actor);

        if ($actor->id === $user->id) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'Você não pode atribuir um cargo a si mesmo.');
        }

        if ($user->id === $server->owner_id) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'O dono do servidor não usa cargo.');
        }

        $membership = ServerMember::query()
            ->where('server_id', $server->id)
            ->where('user_id', $user->id)
            ->first();

        if (! $membership) {
            abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'Este usuário não é membro do servidor.');
        }

        $roleId = $request->validated('role_id');

        if ($roleId !== null) {
            $belongs = Role::query()
                ->where('id', $roleId)
                ->where('server_id', $server->id)
                ->exists();

            if (! $belongs) {
                abort(Response::HTTP_UNPROCESSABLE_ENTITY, 'Cargo inválido para este servidor.');
            }
        }

        $membership->update(['role_id' => $roleId]);

        return new ServerMemberResource($membership->fresh()->load(['user', 'assignedRole']));
    }
}
