<?php

namespace Tests\Unit;

use App\Models\Role;
use App\Models\Server;
use App\Models\ServerMember;
use App\Models\User;
use App\Services\ServerPermissionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ServerPermissionServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_and_admin_are_privileged_and_ignore_denies(): void
    {
        $owner = User::factory()->create();
        $admin = User::factory()->admin()->create();
        $member = User::factory()->create();
        $server = Server::factory()->create(['owner_id' => $owner->id]);

        foreach ([$owner, $admin, $member] as $user) {
            ServerMember::factory()->create([
                'server_id' => $server->id,
                'user_id' => $user->id,
                'role' => $user->id === $owner->id ? ServerMember::ROLE_OWNER : ServerMember::ROLE_MEMBER,
            ]);
        }

        $role = Role::factory()->create([
            'server_id' => $server->id,
            'deny_chat' => true,
            'can_kick_call' => true,
        ]);
        ServerMember::query()->where('user_id', $member->id)->update(['role_id' => $role->id]);

        $service = new ServerPermissionService;

        $this->assertTrue($service->can($server, $owner, 'can_ban_server'));
        $this->assertFalse($service->isDenied($server, $owner, 'deny_chat'));
        $this->assertTrue($service->can($server, $admin, 'can_manage_roles'));
        $this->assertFalse($service->isDenied($server, $admin, 'deny_chat'));
        $this->assertTrue($service->can($server, $member, 'can_kick_call'));
        $this->assertTrue($service->isDenied($server, $member, 'deny_chat'));
        $this->assertFalse($service->can($server, $member, 'can_create_channels'));
        $this->assertFalse($service->canModerateTarget($server, $member, $owner));
        $this->assertFalse($service->canModerateTarget($server, $owner, $owner));
        $this->assertTrue($service->canModerateTarget($server, $owner, $member));
    }
}
