<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('voice_peers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained('rooms')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->boolean('sharing_screen')->default(false);
            $table->timestamp('last_seen_at');
            $table->timestamps();
            $table->unique(['room_id', 'user_id']);
        });

        Schema::create('voice_signals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained('rooms')->cascadeOnDelete();
            $table->foreignId('from_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('to_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('type');
            $table->json('payload');
            $table->timestamp('created_at')->useCurrent();
            $table->index(['room_id', 'to_user_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('voice_signals');
        Schema::dropIfExists('voice_peers');
    }
};
