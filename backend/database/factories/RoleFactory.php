<?php

namespace Database\Factories;

use App\Models\Role;
use App\Models\Server;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Role>
 */
class RoleFactory extends Factory
{
    protected $model = Role::class;

    public function definition(): array
    {
        return [
            'server_id' => Server::factory(),
            'name' => fake()->unique()->words(2, true),
            'position' => 1,
            'can_create_channels' => false,
            'can_kick_call' => false,
            'can_kick_server' => false,
            'can_ban_server' => false,
            'can_mute_call' => false,
            'deny_screen' => false,
            'deny_camera' => false,
            'deny_voice' => false,
            'deny_chat' => false,
        ];
    }
}
