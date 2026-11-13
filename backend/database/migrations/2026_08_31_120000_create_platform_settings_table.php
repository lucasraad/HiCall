<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_settings', function (Blueprint $table) {
            $table->id();
            $table->boolean('transcription_enabled')->default(false);
            $table->string('company_name', 120)->default('HiCall');
            $table->string('logo_url', 2048)->nullable();
            $table->string('primary_color', 7)->default('#1e3a5f');
            $table->string('accent_color', 7)->default('#23a559');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_settings');
    }
};
