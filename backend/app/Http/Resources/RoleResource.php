<?php

namespace App\Http\Resources;

use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Role
 */
class RoleResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'server_id' => $this->server_id,
            'name' => $this->name,
            'position' => (int) $this->position,
            'can_create_channels' => (bool) $this->can_create_channels,
            'can_kick_call' => (bool) $this->can_kick_call,
            'can_kick_server' => (bool) $this->can_kick_server,
            'can_ban_server' => (bool) $this->can_ban_server,
            'can_mute_call' => (bool) $this->can_mute_call,
            'deny_screen' => (bool) $this->deny_screen,
            'deny_camera' => (bool) $this->deny_camera,
            'deny_voice' => (bool) $this->deny_voice,
            'deny_chat' => (bool) $this->deny_chat,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
