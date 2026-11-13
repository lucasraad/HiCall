<?php

namespace Tests\Feature;

use App\Models\Channel;
use App\Models\Role;
use App\Models\Server;
use App\Models\ServerMember;
use App\Models\User;
use App\Models\VoicePeer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RolePermissionTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_create_update_and_delete_role(): void
    {
        [$server, $owner] = $this->ownedServer();

        $created = $this->actingAs($owner, 'sanctum')
            ->postJson("/api/servers/{$server->id}/roles", [
                'name' => 'Moderador',
                'can_kick_call' => true,
                'can_mute_call' => true,
                'deny_chat' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('name', 'Moderador')
            ->assertJsonPath('can_kick_call', true)
            ->assertJsonPath('deny_chat', true);

        $roleId = $created->json('id');

        $this->actingAs($owner, 'sanctum')
            ->putJson("/api/roles/{$roleId}", [
                'name' => 'Mod',
                'can_create_channels' => true,
            ])
            ->assertOk()
            ->assertJsonPath('name', 'Mod')
            ->assertJsonPath('can_create_channels', true)
            ->assertJsonPath('can_kick_call', true);

        $this->actingAs($owner, 'sanctum')
            ->deleteJson("/api/roles/{$roleId}")
            ->assertNoContent();

        $this->assertDatabaseMissing('roles', ['id' => $roleId]);
    }

    public function test_member_cannot_create_role(): void
    {
        [$server, $owner, $member] = $this->serverWithMember();

        $this->actingAs($member, 'sanctum')
            ->postJson("/api/servers/{$server->id}/roles", ['name' => 'Hack'])
            ->assertForbidden();
    }

    public function test_admin_can_manage_roles_without_being_owner(): void
    {
        [$server, $owner] = $this->ownedServer();
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/servers/{$server->id}/roles", ['name' => 'Staff'])
            ->assertCreated()
            ->assertJsonPath('name', 'Staff');
    }

    public function test_owner_assigns_role_to_other_members_not_self(): void
    {
        [$server, $owner, $member] = $this->serverWithMember();
        $role = Role::factory()->create([
            'server_id' => $server->id,
            'name' => 'Canal',
            'can_create_channels' => true,
        ]);

        $this->actingAs($owner, 'sanctum')
            ->putJson("/api/servers/{$server->id}/members/{$owner->id}/role", [
                'role_id' => $role->id,
            ])
            ->assertUnprocessable();

        $this->actingAs($owner, 'sanctum')
            ->putJson("/api/servers/{$server->id}/members/{$member->id}/role", [
                'role_id' => $role->id,
            ])
            ->assertOk()
            ->assertJsonPath('role_id', $role->id)
            ->assertJsonPath('assigned_role.name', 'Canal');

        $this->actingAs($owner, 'sanctum')
            ->putJson("/api/servers/{$server->id}/members/{$member->id}/role", [
                'role_id' => null,
            ])
            ->assertOk()
            ->assertJsonPath('role_id', null);
    }

    public function test_member_with_can_create_channels_can_create_channel(): void
    {
        [$server, $owner, $member] = $this->serverWithMember();
        $this->assignRole($server, $member, ['can_create_channels' => true]);

        $this->actingAs($member, 'sanctum')
            ->postJson("/api/servers/{$server->id}/channels", ['name' => 'voz-2'])
            ->assertCreated()
            ->assertJsonPath('name', 'voz-2');
    }

    public function test_member_without_can_create_channels_cannot_create_channel(): void
    {
        [$server, $owner, $member] = $this->serverWithMember();

        $this->actingAs($member, 'sanctum')
            ->postJson("/api/servers/{$server->id}/channels", ['name' => 'voz-2'])
            ->assertForbidden();
    }

    public function test_deny_chat_blocks_messages_but_owner_and_admin_ignore_it(): void
    {
        [$server, $owner, $member] = $this->serverWithMember();
        $channel = Channel::factory()->create(['server_id' => $server->id]);
        $this->assignRole($server, $member, ['deny_chat' => true]);

        $this->actingAs($member, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/messages", ['body' => 'Oi'])
            ->assertForbidden()
            ->assertJsonPath('message', 'Você não tem permissão para falar no chat deste servidor.');

        $this->actingAs($owner, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/messages", ['body' => 'Dono'])
            ->assertSuccessful();

        $admin = User::factory()->admin()->create();
        ServerMember::factory()->create([
            'server_id' => $server->id,
            'user_id' => $admin->id,
            'role' => ServerMember::ROLE_MEMBER,
        ]);
        $this->assignRole($server, $admin, ['deny_chat' => true]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/messages", ['body' => 'Admin'])
            ->assertSuccessful();
    }

    public function test_member_with_can_kick_server_can_kick_other_member(): void
    {
        [$server, $owner, $member] = $this->serverWithMember();
        $other = User::factory()->create();
        ServerMember::factory()->create([
            'server_id' => $server->id,
            'user_id' => $other->id,
            'role' => ServerMember::ROLE_MEMBER,
        ]);
        $this->assignRole($server, $member, ['can_kick_server' => true]);

        $this->actingAs($member, 'sanctum')
            ->postJson("/api/servers/{$server->id}/remove/{$other->id}")
            ->assertOk();

        $this->assertDatabaseMissing('server_members', [
            'server_id' => $server->id,
            'user_id' => $other->id,
        ]);
    }

    public function test_member_cannot_kick_without_permission(): void
    {
        [$server, $owner, $member] = $this->serverWithMember();
        $other = User::factory()->create();
        ServerMember::factory()->create([
            'server_id' => $server->id,
            'user_id' => $other->id,
            'role' => ServerMember::ROLE_MEMBER,
        ]);

        $this->actingAs($member, 'sanctum')
            ->postJson("/api/servers/{$server->id}/remove/{$other->id}")
            ->assertForbidden();
    }

    public function test_voice_kick_and_mute_require_permission_and_send_moderation_signal(): void
    {
        [$server, $owner, $member] = $this->serverWithMember();
        $channel = Channel::factory()->create(['server_id' => $server->id]);
        $mod = User::factory()->create();
        ServerMember::factory()->create([
            'server_id' => $server->id,
            'user_id' => $mod->id,
            'role' => ServerMember::ROLE_MEMBER,
        ]);
        $this->assignRole($server, $mod, [
            'can_kick_call' => true,
            'can_mute_call' => true,
        ]);

        $this->actingAs($member, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/join")
            ->assertOk();

        $this->actingAs($member, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/kick/{$owner->id}")
            ->assertForbidden();

        $this->actingAs($mod, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/mute/{$member->id}", ['muted' => true])
            ->assertOk()
            ->assertJsonPath('force_muted', true);

        $this->assertDatabaseHas('voice_peers', [
            'room_id' => $channel->id,
            'user_id' => $member->id,
            'force_muted' => true,
        ]);

        $this->actingAs($member, 'sanctum')
            ->getJson("/api/channels/{$channel->id}/voice/signals")
            ->assertOk()
            ->assertJsonFragment(['type' => 'moderation']);

        $this->actingAs($mod, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/kick/{$member->id}")
            ->assertOk();

        $this->assertDatabaseMissing('voice_peers', [
            'room_id' => $channel->id,
            'user_id' => $member->id,
        ]);
    }

    public function test_deny_screen_rejects_screen_signal_and_screen_update(): void
    {
        [$server, $owner, $member] = $this->serverWithMember();
        $channel = Channel::factory()->create(['server_id' => $server->id]);
        $this->assignRole($server, $member, ['deny_screen' => true]);

        $this->actingAs($member, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/join")
            ->assertOk();

        $this->actingAs($member, 'sanctum')
            ->putJson("/api/channels/{$channel->id}/voice/screen", ['sharing_screen' => true])
            ->assertForbidden();

        $this->actingAs($member, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/signals", [
                'to_user_id' => $owner->id,
                'type' => 'screen',
                'payload' => ['sharing' => true],
            ])
            ->assertForbidden();

        $this->actingAs($owner, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/join")
            ->assertOk();

        $this->actingAs($owner, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/signals", [
                'to_user_id' => $member->id,
                'type' => 'screen',
                'payload' => ['sharing' => true],
            ])
            ->assertSuccessful();
    }

    public function test_deny_camera_rejects_camera_signal(): void
    {
        [$server, $owner, $member] = $this->serverWithMember();
        $channel = Channel::factory()->create(['server_id' => $server->id]);
        $this->assignRole($server, $member, ['deny_camera' => true]);

        $this->actingAs($member, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/signals", [
                'to_user_id' => $owner->id,
                'type' => 'screen',
                'payload' => ['camera' => true],
            ])
            ->assertForbidden();
    }

    public function test_deny_voice_marks_peer_force_muted_on_join(): void
    {
        [$server, $owner, $member] = $this->serverWithMember();
        $channel = Channel::factory()->create(['server_id' => $server->id]);
        $this->assignRole($server, $member, ['deny_voice' => true]);

        $this->actingAs($member, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/join")
            ->assertOk();

        $this->assertDatabaseHas('voice_peers', [
            'room_id' => $channel->id,
            'user_id' => $member->id,
            'force_muted' => true,
        ]);

        $this->actingAs($member, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/heartbeat")
            ->assertOk()
            ->assertJsonPath('force_muted', true);
    }

    public function test_transcription_endpoint_was_removed(): void
    {
        [$server, $owner] = $this->serverWithMember();
        $channel = Channel::factory()->create(['server_id' => $server->id]);
        $this->actingAs($owner, 'sanctum')
            ->putJson("/api/channels/{$channel->id}/voice/transcription", ['enabled' => true])
            ->assertNotFound();
    }

    public function test_call_kick_does_not_ban_and_member_can_rejoin(): void
    {
        [$server, $owner, $member] = $this->serverWithMember();
        $channel = Channel::factory()->create(['server_id' => $server->id]);
        $this->actingAs($member, 'sanctum')->postJson("/api/channels/{$channel->id}/voice/join")->assertOk();
        $this->actingAs($owner, 'sanctum')->postJson("/api/channels/{$channel->id}/voice/kick/{$member->id}")->assertOk();
        $this->assertDatabaseHas('server_members', ['server_id' => $server->id, 'user_id' => $member->id]);
        $this->assertDatabaseMissing('server_bans', ['server_id' => $server->id, 'user_id' => $member->id]);
        $this->actingAs($member, 'sanctum')->postJson("/api/channels/{$channel->id}/voice/join")->assertOk();
    }

    public function test_hierarchy_blocks_equal_and_higher_roles_and_allows_lower(): void
    {
        [$server, $owner, $member] = $this->serverWithMember();
        $mod = User::factory()->create();
        ServerMember::factory()->create(['server_id' => $server->id, 'user_id' => $mod->id]);
        $this->assignRole($server, $mod, ['position' => 5, 'can_kick_call' => true, 'can_mute_call' => true, 'can_kick_server' => true, 'can_ban_server' => true]);
        $targetRole = $this->assignRole($server, $member, ['position' => 5]);
        $channel = Channel::factory()->create(['server_id' => $server->id]);
        $this->actingAs($member, 'sanctum')->postJson("/api/channels/{$channel->id}/voice/join")->assertOk();
        foreach ([5, 6] as $position) {
            $targetRole->update(['position' => $position]);
            $this->actingAs($mod, 'sanctum')->postJson("/api/channels/{$channel->id}/voice/kick/{$member->id}")->assertUnprocessable();
            $this->actingAs($mod, 'sanctum')->postJson("/api/channels/{$channel->id}/voice/mute/{$member->id}", ['muted' => true])->assertUnprocessable();
            $this->actingAs($mod, 'sanctum')->postJson("/api/servers/{$server->id}/remove/{$member->id}")->assertUnprocessable();
            $this->actingAs($mod, 'sanctum')->postJson("/api/servers/{$server->id}/ban/{$member->id}")->assertUnprocessable();
        }
        $targetRole->update(['position' => 4]);
        $this->actingAs($mod, 'sanctum')->postJson("/api/channels/{$channel->id}/voice/mute/{$member->id}", ['muted' => true])->assertOk();
        $this->actingAs($mod, 'sanctum')->postJson("/api/channels/{$channel->id}/voice/kick/{$member->id}")->assertOk();
    }

    public function test_kick_does_not_ban_or_rotate_and_ban_requires_its_own_permission(): void
    {
        [$server, $owner, $member] = $this->serverWithMember();
        $mod = User::factory()->create();
        ServerMember::factory()->create(['server_id' => $server->id, 'user_id' => $mod->id]);
        $this->assignRole($server, $mod, ['can_kick_server' => true]);
        $channel = Channel::factory()->create(['server_id' => $server->id]);
        $this->actingAs($member, 'sanctum')->postJson("/api/channels/{$channel->id}/voice/join")->assertOk();
        $oldCode = $server->invite_code;
        $oldPassword = $server->password;
        $this->actingAs($mod, 'sanctum')->postJson("/api/servers/{$server->id}/ban/{$member->id}")->assertForbidden();
        $this->actingAs($mod, 'sanctum')->postJson("/api/servers/{$server->id}/remove/{$member->id}")->assertOk();
        $this->assertDatabaseMissing('server_bans', ['server_id' => $server->id, 'user_id' => $member->id]);
        $this->assertDatabaseMissing('voice_peers', ['room_id' => $channel->id, 'user_id' => $member->id]);
        $this->assertSame($oldCode, $server->fresh()->invite_code);
        $this->assertSame($oldPassword, $server->fresh()->password);
    }

    public function test_role_level_is_validated_and_returned(): void
    {
        [$server, $owner] = $this->ownedServer();
        $this->actingAs($owner, 'sanctum')->postJson("/api/servers/{$server->id}/roles", ['name' => 'Mod', 'position' => 12])->assertCreated()->assertJsonPath('position', 12);
        foreach ([0, -1, 1001] as $position) {
            $this->actingAs($owner, 'sanctum')->postJson("/api/servers/{$server->id}/roles", ['name' => 'Invalid', 'position' => $position])->assertUnprocessable();
        }
    }

    public function test_servers_index_includes_permissions_for_member_with_role(): void
    {
        [$server, $owner, $member] = $this->serverWithMember();
        $this->assignRole($server, $member, [
            'can_mute_call' => true,
            'deny_screen' => true,
        ]);

        $this->actingAs($member, 'sanctum')
            ->getJson('/api/servers')
            ->assertOk()
            ->assertJsonPath('0.permissions.can_mute_call', true)
            ->assertJsonPath('0.permissions.deny_screen', true)
            ->assertJsonPath('0.permissions.can_manage_roles', false)
            ->assertJsonPath('0.permissions.can_create_channels', false);

        $this->actingAs($owner, 'sanctum')
            ->getJson('/api/servers')
            ->assertOk()
            ->assertJsonPath('0.permissions.can_manage_roles', true)
            ->assertJsonPath('0.permissions.deny_chat', false);
    }

    /**
     * @return array{0: Server, 1: User}
     */
    private function ownedServer(): array
    {
        $owner = User::factory()->create();
        $server = Server::factory()->create(['owner_id' => $owner->id]);
        ServerMember::factory()->create([
            'server_id' => $server->id,
            'user_id' => $owner->id,
            'role' => ServerMember::ROLE_OWNER,
        ]);

        return [$server, $owner];
    }

    /**
     * @return array{0: Server, 1: User, 2: User}
     */
    private function serverWithMember(): array
    {
        [$server, $owner] = $this->ownedServer();
        $member = User::factory()->create();
        ServerMember::factory()->create([
            'server_id' => $server->id,
            'user_id' => $member->id,
            'role' => ServerMember::ROLE_MEMBER,
        ]);

        return [$server, $owner, $member];
    }

    /**
     * @param  array<string, bool>  $flags
     */
    private function assignRole(Server $server, User $user, array $flags): Role
    {
        $role = Role::factory()->create([
            'server_id' => $server->id,
            ...$flags,
        ]);

        ServerMember::query()
            ->where('server_id', $server->id)
            ->where('user_id', $user->id)
            ->update(['role_id' => $role->id]);

        return $role;
    }
}
