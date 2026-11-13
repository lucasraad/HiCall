<?php

namespace App\Http\Resources;

use App\Models\ServerMember;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin ServerMember
 */
class ServerMemberResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'role' => $this->role,
            'joined_at' => $this->joined_at?->toIso8601String(),
            'user' => new UserResource($this->whenLoaded('user')),
            'assigned_role' => $this->when(
                $this->relationLoaded('assignedRole'),
                fn () => $this->assignedRole ? new RoleResource($this->assignedRole) : null,
            ),
            'role_id' => $this->role_id,
        ];
    }
}
