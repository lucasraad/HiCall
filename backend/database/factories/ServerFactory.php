<?php

namespace Database\Factories;

use App\Models\Server;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<Server>
 */
class ServerFactory extends Factory
{
    protected $model = Server::class;

    public function definition(): array
    {
        return [
            'name' => fake()->words(2, true),
            'invite_code' => strtoupper(Str::random(8)),
            'password' => Hash::make('secret'),
            'owner_id' => User::factory(),
        ];
    }
}
