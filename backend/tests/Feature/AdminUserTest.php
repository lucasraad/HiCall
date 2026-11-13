<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminUserTest extends TestCase
{
    use RefreshDatabase;

    public function test_non_admin_cannot_access_admin_users(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/admin/users')
            ->assertForbidden();
    }

    public function test_admin_can_create_update_ban_and_unban_users(): void
    {
        $admin = User::factory()->admin()->create();
        $target = User::factory()->create([
            'email' => 'friend@example.com',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/users', [
                'name' => 'Novo Amigo',
                'email' => 'novo@example.com',
                'password' => 'password123',
            ])
            ->assertCreated()
            ->assertJsonPath('email', 'novo@example.com');

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/admin/users/{$target->id}", [
                'name' => 'Amigo Editado',
            ])
            ->assertOk()
            ->assertJsonPath('name', 'Amigo Editado');

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/users/{$target->id}/ban")
            ->assertOk()
            ->assertJsonPath('is_banned', true);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/users/{$target->id}/unban")
            ->assertOk()
            ->assertJsonPath('is_banned', false);
    }

    public function test_admin_cannot_ban_another_admin(): void
    {
        $admin = User::factory()->admin()->create();
        $otherAdmin = User::factory()->admin()->create();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/admin/users/{$otherAdmin->id}/ban")
            ->assertStatus(422);
    }
}
