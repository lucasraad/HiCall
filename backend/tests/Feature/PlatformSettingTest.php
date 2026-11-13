<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlatformSettingTest extends TestCase
{
    use RefreshDatabase;

    public function test_removed_settings_cannot_be_read_or_updated_even_by_admin(): void
    {
        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'sanctum')->getJson('/api/admin/settings')->assertNotFound();
        $this->actingAs($admin, 'sanctum')->putJson('/api/admin/settings', [
            'transcription_enabled' => true,
            'company_name' => 'Outra marca',
        ])->assertNotFound();
    }
}
