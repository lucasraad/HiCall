<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('server_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->boolean('can_transcribe_call')->default(false);
            $table->boolean('can_create_channels')->default(false);
            $table->boolean('can_kick_call')->default(false);
            $table->boolean('can_kick_server')->default(false);
            $table->boolean('can_mute_call')->default(false);
            $table->boolean('deny_screen')->default(false);
            $table->boolean('deny_camera')->default(false);
            $table->boolean('deny_voice')->default(false);
            $table->boolean('deny_chat')->default(false);
            $table->timestamps();
            $table->unique(['server_id', 'name']);
        });

        Schema::table('server_members', function (Blueprint $table) {
            $table->foreignId('role_id')->nullable()->after('role')->constrained('roles')->nullOnDelete();
        });

        Schema::table('rooms', function (Blueprint $table) {
            $table->boolean('transcription_enabled')->default(false)->after('position');
        });

        Schema::table('voice_peers', function (Blueprint $table) {
            $table->boolean('force_muted')->default(false)->after('sharing_screen');
        });
    }

    public function down(): void
    {
        Schema::table('voice_peers', function (Blueprint $table) {
            $table->dropColumn('force_muted');
        });

        Schema::table('rooms', function (Blueprint $table) {
            $table->dropColumn('transcription_enabled');
        });

        Schema::table('server_members', function (Blueprint $table) {
            $table->dropConstrainedForeignId('role_id');
        });

        Schema::dropIfExists('roles');
    }
};
