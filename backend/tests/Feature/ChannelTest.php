<?php

namespace Tests\Feature;

use App\Models\Channel;
use App\Models\Message;
use App\Models\Server;
use App\Models\ServerBan;
use App\Models\ServerMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChannelTest extends TestCase
{
    use RefreshDatabase;

    public function test_member_can_list_channels(): void
    {
        $user = User::factory()->create();
        $server = Server::factory()->create();
        ServerMember::factory()->create([
            'server_id' => $server->id,
            'user_id' => $user->id,
            'role' => ServerMember::ROLE_MEMBER,
        ]);
        Channel::factory()->create(['server_id' => $server->id, 'name' => 'geral']);

        $this->actingAs($user, 'sanctum')
            ->getJson("/api/servers/{$server->id}/channels")
            ->assertOk()
            ->assertJsonFragment(['name' => 'geral']);
    }

    public function test_owner_can_create_channel(): void
    {
        $owner = User::factory()->create();
        $server = Server::factory()->create(['owner_id' => $owner->id]);
        ServerMember::factory()->create([
            'server_id' => $server->id,
            'user_id' => $owner->id,
            'role' => ServerMember::ROLE_OWNER,
        ]);
        Channel::factory()->create(['server_id' => $server->id]);

        $this->actingAs($owner, 'sanctum')
            ->postJson("/api/servers/{$server->id}/channels", ['name' => 'voz-1'])
            ->assertCreated()
            ->assertJsonPath('name', 'voz-1');

        $this->assertDatabaseHas('rooms', [
            'server_id' => $server->id,
            'name' => 'voz-1',
        ]);
    }

    public function test_owner_cannot_delete_last_channel(): void
    {
        $owner = User::factory()->create();
        $server = Server::factory()->create(['owner_id' => $owner->id]);
        ServerMember::factory()->create([
            'server_id' => $server->id,
            'user_id' => $owner->id,
            'role' => ServerMember::ROLE_OWNER,
        ]);
        $channel = Channel::factory()->create(['server_id' => $server->id]);

        $this->actingAs($owner, 'sanctum')
            ->deleteJson("/api/channels/{$channel->id}")
            ->assertUnprocessable();
    }
}
