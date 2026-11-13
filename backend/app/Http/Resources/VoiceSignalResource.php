<?php

namespace App\Http\Resources;

use App\Models\VoiceSignal;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin VoiceSignal
 */
class VoiceSignalResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'from_user_id' => $this->from_user_id,
            'to_user_id' => $this->to_user_id,
            'type' => $this->type,
            'payload' => $this->payload,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
