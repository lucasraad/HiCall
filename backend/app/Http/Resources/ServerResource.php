<?php

namespace App\Http\Resources;

use App\Models\Server;
use App\Models\ServerMember;
use App\Services\ServerPermissionService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Server
 */
class ServerResource extends JsonResource
{
    /**
     * @param  array<string, mixed>  $extra
     */
    public function __construct($resource, protected array $extra = [])
    {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $membershipRole = $this->extra['membership_role'] ?? null;
        $isOwner = $membershipRole === ServerMember::ROLE_OWNER || $this->owner_id === $request->user()?->id;
        $permissions = $this->extra['permissions'] ?? app(ServerPermissionService::class)->snapshot($this->resource, $request->user());
        $assignedRole = $this->extra['assigned_role'] ?? $this->currentAssignedRole($request);

        return [
            'id' => $this->id,
            'name' => $this->name,
            'invite_code' => $this->invite_code,
            'owner_id' => $this->owner_id,
            'membership_role' => $membershipRole,
            'is_owner' => $isOwner,
            'permissions' => $permissions,
            'assigned_role' => $assignedRole,
            'member_count' => $this->whenCounted('members'),
            'credentials_rotated_at' => $this->credentials_rotated_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'password' => $this->when(isset($this->extra['password']), $this->extra['password'] ?? null),
            'channels' => ChannelResource::collection($this->whenLoaded('channels')),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function currentAssignedRole(Request $request): ?array
    {
        if (! $this->resource->relationLoaded('members') || ! $request->user()) {
            return null;
        }

        $membership = $this->resource->members->firstWhere('user_id', $request->user()->id);

        if (! $membership?->relationLoaded('assignedRole') || ! $membership->assignedRole) {
            return null;
        }

        return (new RoleResource($membership->assignedRole))->resolve($request);
    }
}
