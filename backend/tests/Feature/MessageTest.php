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

class MessageTest extends TestCase
{
    use RefreshDatabase;

    public function test_member_can_send_and_list_messages(): void
    {
        $user = User::factory()->create();
        $server = Server::factory()->create();
        ServerMember::factory()->create([
            'server_id' => $server->id,
            'user_id' => $user->id,
            'role' => ServerMember::ROLE_MEMBER,
        ]);
        $channel = Channel::factory()->create(['server_id' => $server->id]);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/messages", ['body' => 'Olá!'])
            ->assertCreated()
            ->assertJsonPath('body', 'Olá!');

        $this->actingAs($user, 'sanctum')
            ->getJson("/api/channels/{$channel->id}/messages")
            ->assertOk()
            ->assertJsonFragment(['body' => 'Olá!']);
    }

    public function test_banned_member_cannot_send_messages(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $server = Server::factory()->create(['owner_id' => $owner->id]);
        $channel = Channel::factory()->create(['server_id' => $server->id]);

        ServerMember::factory()->create([
            'server_id' => $server->id,
            'user_id' => $member->id,
            'role' => ServerMember::ROLE_MEMBER,
        ]);
        ServerBan::factory()->create([
            'server_id' => $server->id,
            'user_id' => $member->id,
            'banned_by' => $owner->id,
        ]);

        $this->actingAs($member, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/messages", ['body' => 'Olá!'])
            ->assertForbidden();
    }

    public function test_polling_returns_messages_after_id(): void
    {
        $user = User::factory()->create();
        $server = Server::factory()->create();
        ServerMember::factory()->create([
            'server_id' => $server->id,
            'user_id' => $user->id,
            'role' => ServerMember::ROLE_MEMBER,
        ]);
        $channel = Channel::factory()->create(['server_id' => $server->id]);

        $first = Message::factory()->create([
            'room_id' => $channel->id,
            'user_id' => $user->id,
            'body' => 'Primeira',
        ]);
        Message::factory()->create([
            'room_id' => $channel->id,
            'user_id' => $user->id,
            'body' => 'Segunda',
        ]);

        $this->actingAs($user, 'sanctum')
            ->getJson("/api/channels/{$channel->id}/messages?after_id={$first->id}")
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonFragment(['body' => 'Segunda'])
            ->assertJsonMissing(['body' => 'Primeira']);
    }
}
