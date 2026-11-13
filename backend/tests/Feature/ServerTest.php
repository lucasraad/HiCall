<?php

namespace Tests\Feature;

use App\Models\Channel;
use App\Models\Message;
use App\Models\Server;
use App\Models\ServerBan;
use App\Models\ServerMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ServerTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_user_cannot_create_a_server(): void
    {
        $this->postJson('/api/servers', [
            'name' => 'Servidor Teste',
            'password' => 'secret',
        ])->assertUnauthorized();
    }

    public function test_authenticated_user_can_create_a_server(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/servers', [
            'name' => 'Servidor Teste',
            'password' => 'secret',
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('name', 'Servidor Teste')
            ->assertJsonPath('is_owner', true)
            ->assertJsonStructure(['id', 'invite_code', 'owner_id', 'created_at', 'channels']);

        $inviteCode = $response->json('invite_code');
        $this->assertDatabaseHas('servers', [
            'invite_code' => $inviteCode,
            'name' => 'Servidor Teste',
            'owner_id' => $user->id,
        ]);
        $this->assertDatabaseHas('server_members', [
            'server_id' => $response->json('id'),
            'user_id' => $user->id,
            'role' => ServerMember::ROLE_OWNER,
        ]);
        $this->assertDatabaseHas('rooms', [
            'server_id' => $response->json('id'),
            'name' => 'geral',
        ]);
    }

    public function test_user_can_list_their_servers(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();

        $ownedServer = Server::factory()->create([
            'owner_id' => $owner->id,
            'name' => 'Owned',
        ]);
        ServerMember::factory()->create([
            'server_id' => $ownedServer->id,
            'user_id' => $owner->id,
            'role' => ServerMember::ROLE_OWNER,
        ]);

        $joinedServer = Server::factory()->create(['name' => 'Joined']);
        ServerMember::factory()->create([
            'server_id' => $joinedServer->id,
            'user_id' => $member->id,
            'role' => ServerMember::ROLE_MEMBER,
        ]);

        $this->actingAs($owner, 'sanctum')
            ->getJson('/api/servers')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Owned'])
            ->assertJsonMissing(['name' => 'Joined']);
    }

    public function test_verify_succeeds_and_registers_membership(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $server = Server::factory()->create([
            'owner_id' => $owner->id,
            'password' => Hash::make('secret'),
        ]);
        ServerMember::factory()->create([
            'server_id' => $server->id,
            'user_id' => $owner->id,
            'role' => ServerMember::ROLE_OWNER,
        ]);

        $this->actingAs($member, 'sanctum')
            ->postJson('/api/servers/verify', [
                'invite_code' => $server->invite_code,
                'password' => 'secret',
            ])
            ->assertOk()
            ->assertJsonPath('invite_code', $server->invite_code);

        $this->assertDatabaseHas('server_members', [
            'server_id' => $server->id,
            'user_id' => $member->id,
            'role' => ServerMember::ROLE_MEMBER,
        ]);
    }

    public function test_verify_fails_for_banned_server_member(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $server = Server::factory()->create([
            'owner_id' => $owner->id,
            'password' => Hash::make('secret'),
        ]);

        ServerBan::factory()->create([
            'server_id' => $server->id,
            'user_id' => $member->id,
            'banned_by' => $owner->id,
        ]);

        $this->actingAs($member, 'sanctum')
            ->postJson('/api/servers/verify', [
                'invite_code' => $server->invite_code,
                'password' => 'secret',
            ])
            ->assertUnprocessable();
    }

    public function test_owner_can_ban_member_and_rotate_credentials(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $server = Server::factory()->create([
            'owner_id' => $owner->id,
            'password' => Hash::make('secret'),
        ]);

        ServerMember::factory()->create([
            'server_id' => $server->id,
            'user_id' => $owner->id,
            'role' => ServerMember::ROLE_OWNER,
        ]);
        ServerMember::factory()->create([
            'server_id' => $server->id,
            'user_id' => $member->id,
            'role' => ServerMember::ROLE_MEMBER,
        ]);

        $oldCode = $server->invite_code;

        $response = $this->actingAs($owner, 'sanctum')
            ->postJson("/api/servers/{$server->id}/ban/{$member->id}");

        $response
            ->assertOk()
            ->assertJsonStructure(['message', 'server' => ['invite_code', 'password']]);

        $newCode = $response->json('server.invite_code');
        $this->assertNotSame($oldCode, $newCode);
        $this->assertDatabaseMissing('server_members', [
            'server_id' => $server->id,
            'user_id' => $member->id,
        ]);
        $this->assertDatabaseHas('server_bans', [
            'server_id' => $server->id,
            'user_id' => $member->id,
        ]);

        $server->refresh();
        $this->assertNotNull($server->credentials_rotated_at);
        $this->assertFalse(Hash::check('secret', $server->password));
        $this->assertTrue(Hash::check($response->json('server.password'), $server->password));
    }
}
