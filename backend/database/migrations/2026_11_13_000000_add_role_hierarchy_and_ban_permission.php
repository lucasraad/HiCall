<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->unsignedInteger('position')->default(1);
            $table->boolean('can_ban_server')->default(false);
        });

        // The previous server kick was a ban. Preserve existing moderators' powers.
        DB::table('roles')->where('can_kick_server', true)->update(['can_ban_server' => true]);
    }

    public function down(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->dropColumn(['position', 'can_ban_server']);
        });
    }
};
