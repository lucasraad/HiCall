<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('voice_peers', function (Blueprint $table) {
            $table->boolean('camera_on')->default(false)->after('sharing_screen');
        });
    }

    public function down(): void
    {
        Schema::table('voice_peers', function (Blueprint $table) {
            $table->dropColumn('camera_on');
        });
    }
};
