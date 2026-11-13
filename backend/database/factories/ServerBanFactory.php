<?php

namespace Database\Factories;

use App\Models\Server;
use App\Models\ServerBan;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ServerBan>
 */
class ServerBanFactory extends Factory
{
    protected $model = ServerBan::class;

    public function definition(): array
    {
        return [
            'server_id' => Server::factory(),
            'user_id' => User::factory(),
            'banned_by' => User::factory(),
            'banned_at' => now(),
        ];
    }
}
