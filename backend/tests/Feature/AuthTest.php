<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_login_and_receive_token(): void
    {
        $user = User::factory()->create([
            'email' => 'ana@example.com',
            'password' => 'password123',
        ]);

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password123',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('user.email', 'ana@example.com')
            ->assertJsonPath('user.role', 'user')
            ->assertJsonStructure(['token']);
    }

    public function test_login_fails_with_wrong_password(): void
    {
        User::factory()->create([
            'email' => 'ana@example.com',
            'password' => 'password123',
        ]);

        $this->postJson('/api/login', [
            'email' => 'ana@example.com',
            'password' => 'wrong-password',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email']);
    }

    public function test_banned_user_cannot_login(): void
    {
        User::factory()->banned()->create([
            'email' => 'banned@example.com',
            'password' => 'password123',
        ]);

        $this->postJson('/api/login', [
            'email' => 'banned@example.com',
            'password' => 'password123',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email']);
    }

    public function test_public_register_route_is_not_available(): void
    {
        $this->postJson('/api/register', [
            'name' => 'Test',
            'email' => 'test@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])->assertNotFound();
    }

    public function test_authenticated_user_can_logout(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('hicall')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/logout')
            ->assertNoContent();

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_login_revokes_other_tokens_for_the_same_user(): void
    {
        $user = User::factory()->create([
            'email' => 'ana@example.com',
            'password' => 'password123',
        ]);

        $first = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password123',
        ])->json('token');

        $this->assertNotEmpty($first);
        $this->withToken($first)->getJson('/api/user')->assertOk();

        $second = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password123',
        ])->json('token');

        $this->assertNotEquals($first, $second);

        $this->flushHeaders();
        $this->app['auth']->forgetGuards();

        $this->assertNull(PersonalAccessToken::findToken($first));
        $this->withToken($first)->getJson('/api/user')->assertUnauthorized();
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $this->withToken($second)->getJson('/api/user')->assertOk();
        $this->assertDatabaseCount('personal_access_tokens', 1);
    }
}
