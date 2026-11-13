<?php

namespace Database\Factories;

use App\Models\Channel;
use App\Models\VoicePeer;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<VoicePeer>
 */
class VoicePeerFactory extends Factory
{
    protected $model = VoicePeer::class;

    public function definition(): array
    {
        return [
            'room_id' => Channel::factory(),
            'user_id' => User::factory(),
            'sharing_screen' => false,
            'last_seen_at' => now(),
        ];
    }
}
