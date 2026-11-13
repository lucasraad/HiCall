<?php

namespace App\Http\Resources;

use App\Models\VoicePeer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin VoicePeer
 */
class VoicePeerResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'user_id' => $this->user_id,
            'sharing_screen' => (bool) $this->sharing_screen,
            'camera_on' => (bool) $this->camera_on,
            'force_muted' => (bool) $this->force_muted,
            'last_seen_at' => $this->last_seen_at?->toIso8601String(),
            'user' => new UserResource($this->whenLoaded('user')),
        ];
    }
}
