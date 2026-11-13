<?php

namespace Tests\Feature;

use App\Models\Channel;
use App\Models\Server;
use App\Models\ServerMember;
use App\Models\User;
use App\Models\VoicePeer;
use App\Models\VoiceSignal;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VoiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_member_can_join_voice_and_list_peers(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $server = Server::factory()->create(['owner_id' => $owner->id]);
        $channel = Channel::factory()->create(['server_id' => $server->id]);

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

        VoicePeer::factory()->create([
            'room_id' => $channel->id,
            'user_id' => $owner->id,
            'last_seen_at' => now(),
        ]);

        $this->actingAs($member, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/join")
            ->assertOk()
            ->assertJsonCount(1);

        $this->assertDatabaseHas('voice_peers', [
            'room_id' => $channel->id,
            'user_id' => $member->id,
        ]);
    }

    public function test_member_can_exchange_signals(): void
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $server = Server::factory()->create(['owner_id' => $owner->id]);
        $channel = Channel::factory()->create(['server_id' => $server->id]);

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

        $this->actingAs($owner, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/signals", [
                'to_user_id' => $member->id,
                'type' => 'offer',
                'payload' => ['sdp' => ['type' => 'offer', 'sdp' => 'test']],
            ])
            ->assertCreated();

        $this->actingAs($member, 'sanctum')
            ->getJson("/api/channels/{$channel->id}/voice/signals")
            ->assertOk()
            ->assertJsonFragment(['type' => 'offer']);
    }

    public function test_screen_sharing_is_visible_to_the_other_peer(): void
    {
        [$channel, $owner, $member] = $this->voiceRoom();

        $this->actingAs($owner, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/join")
            ->assertOk();
        $this->actingAs($member, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/join")
            ->assertOk();

        $this->actingAs($owner, 'sanctum')
            ->putJson("/api/channels/{$channel->id}/voice/screen", [
                'sharing_screen' => true,
            ])
            ->assertOk();

        $this->actingAs($member, 'sanctum')
            ->getJson("/api/channels/{$channel->id}/voice/peers")
            ->assertOk()
            ->assertJsonPath('0.sharing_screen', true);

        $this->actingAs($owner, 'sanctum')
            ->putJson("/api/channels/{$channel->id}/voice/screen", [
                'sharing_screen' => false,
            ])
            ->assertOk();

        $this->actingAs($member, 'sanctum')
            ->getJson("/api/channels/{$channel->id}/voice/peers")
            ->assertOk()
            ->assertJsonPath('0.sharing_screen', false);
    }

    public function test_member_can_persist_camera_on_for_late_joiners(): void
    {
        [$channel, $owner, $member] = $this->voiceRoom();

        $this->actingAs($owner, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/join")
            ->assertOk();

        $this->actingAs($owner, 'sanctum')
            ->putJson("/api/channels/{$channel->id}/voice/screen", [
                'sharing_screen' => false,
                'camera_on' => true,
            ])
            ->assertOk();

        $this->actingAs($member, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/join")
            ->assertOk()
            ->assertJsonPath('0.camera_on', true);
    }

    public function test_screen_signal_is_delivered_to_the_other_peer(): void
    {
        [$channel, $owner, $member] = $this->voiceRoom();

        $this->actingAs($owner, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/signals", [
                'to_user_id' => $member->id,
                'type' => 'screen',
                'payload' => ['sharing' => true],
            ])
            ->assertCreated();

        $this->actingAs($member, 'sanctum')
            ->getJson("/api/channels/{$channel->id}/voice/signals")
            ->assertOk()
            ->assertJsonFragment(['type' => 'screen'])
            ->assertJsonPath('0.payload.sharing', true);
    }

    public function test_member_not_in_call_cannot_update_screen(): void
    {
        [$channel, $owner] = $this->voiceRoom();

        $this->actingAs($owner, 'sanctum')
            ->putJson("/api/channels/{$channel->id}/voice/screen", [
                'sharing_screen' => true,
            ])
            ->assertNotFound();
    }

    public function test_member_sees_everyone_in_server_voice_presence_including_self(): void
    {
        [$channel, $owner, $member] = $this->voiceRoom();

        VoicePeer::factory()->create([
            'room_id' => $channel->id,
            'user_id' => $owner->id,
            'last_seen_at' => now(),
        ]);
        VoicePeer::factory()->create([
            'room_id' => $channel->id,
            'user_id' => $member->id,
            'last_seen_at' => now(),
        ]);

        $this->actingAs($owner, 'sanctum')
            ->getJson("/api/servers/{$channel->server_id}/voice/presence")
            ->assertOk()
            ->assertJsonPath('0.channel_id', $channel->id)
            ->assertJsonCount(2, '0.peers')
            ->assertJsonFragment(['user_id' => $owner->id])
            ->assertJsonFragment(['user_id' => $member->id]);
    }

    public function test_leave_and_heartbeat_are_not_found_outside_the_call(): void
    {
        [$channel, $owner] = $this->voiceRoom();

        $this->actingAs($owner, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/leave")
            ->assertNotFound();
        $this->actingAs($owner, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/heartbeat")
            ->assertNotFound();
    }

    public function test_leave_and_heartbeat_succeed_inside_the_call(): void
    {
        [$channel, $owner] = $this->voiceRoom();

        $this->actingAs($owner, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/join")
            ->assertOk();
        $this->actingAs($owner, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/heartbeat")
            ->assertOk();
        $this->actingAs($owner, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/leave")
            ->assertOk();
    }

    public function test_stale_peers_are_purged_after_forty_six_seconds(): void
    {
        [$channel, $owner, $member] = $this->voiceRoom();
        $now = Carbon::parse('2026-10-09 12:00:00');
        Carbon::setTestNow($now);

        VoicePeer::factory()->create([
            'room_id' => $channel->id,
            'user_id' => $owner->id,
            'last_seen_at' => $now,
        ]);

        Carbon::setTestNow($now->copy()->addSeconds(46));

        $this->actingAs($member, 'sanctum')
            ->getJson("/api/channels/{$channel->id}/voice/peers")
            ->assertOk()
            ->assertJsonCount(0);

        $this->assertDatabaseMissing('voice_peers', [
            'room_id' => $channel->id,
            'user_id' => $owner->id,
        ]);

        Carbon::setTestNow();
    }

    public function test_join_prunes_old_signals_but_keeps_recent_and_respects_limit(): void
    {
        [$channel, $owner, $member] = $this->voiceRoom();
        $now = Carbon::parse('2026-10-09 18:00:00');
        Carbon::setTestNow($now);

        $oldIds = [];
        for ($i = 0; $i < 502; $i++) {
            $signal = VoiceSignal::query()->create([
                'room_id' => $channel->id,
                'from_user_id' => $owner->id,
                'to_user_id' => $member->id,
                'type' => VoiceSignal::TYPE_ICE,
                'payload' => ['i' => $i],
            ]);
            $signal->created_at = $now->copy()->subHours(2);
            $signal->save();
            $oldIds[] = $signal->id;
        }

        $recent = VoiceSignal::query()->create([
            'room_id' => $channel->id,
            'from_user_id' => $owner->id,
            'to_user_id' => $member->id,
            'type' => VoiceSignal::TYPE_ICE,
            'payload' => ['recent' => true],
        ]);

        $this->actingAs($member, 'sanctum')
            ->postJson("/api/channels/{$channel->id}/voice/join")
            ->assertOk();

        $remainingOld = VoiceSignal::query()
            ->whereIn('id', $oldIds)
            ->count();
        $this->assertSame(2, $remainingOld);
        $this->assertDatabaseHas('voice_signals', ['id' => $recent->id]);

        Carbon::setTestNow();
    }

    /**
     * @return array{0: Channel, 1: User, 2: User}
     */
    private function voiceRoom(): array
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $server = Server::factory()->create(['owner_id' => $owner->id]);
        $channel = Channel::factory()->create(['server_id' => $server->id]);

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

        return [$channel, $owner, $member];
    }
}
