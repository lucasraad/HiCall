<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('servers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('invite_code')->unique();
            $table->string('password');
            $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
            $table->timestamp('credentials_rotated_at')->nullable();
            $table->timestamps();
        });

        Schema::create('server_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('server_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role')->default('member');
            $table->timestamp('joined_at');
            $table->timestamps();
            $table->unique(['server_id', 'user_id']);
        });

        Schema::create('server_bans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('server_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('banned_by')->constrained('users')->cascadeOnDelete();
            $table->timestamp('banned_at');
            $table->timestamps();
            $table->unique(['server_id', 'user_id']);
        });

        Schema::table('rooms', function (Blueprint $table) {
            $table->foreignId('server_id')->nullable()->after('id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('position')->default(0)->after('name');
        });

        $this->migrateLegacyRooms();

        Schema::table('rooms', function (Blueprint $table) {
            $table->dropUnique(['room_code']);
        });

        Schema::table('rooms', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
            $table->dropColumn(['room_code', 'password', 'user_id', 'credentials_rotated_at']);
        });

        Schema::dropIfExists('room_bans');
        Schema::dropIfExists('room_members');

        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained('rooms')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('body', 2000);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('messages');

        Schema::table('rooms', function (Blueprint $table) {
            $table->string('room_code')->nullable();
            $table->string('password')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->timestamp('credentials_rotated_at')->nullable();
            $table->dropConstrainedForeignId('server_id');
            $table->dropColumn('position');
        });

        Schema::dropIfExists('server_bans');
        Schema::dropIfExists('server_members');
        Schema::dropIfExists('servers');

        Schema::create('room_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role')->default('member');
            $table->timestamp('joined_at');
            $table->timestamps();
            $table->unique(['room_id', 'user_id']);
        });

        Schema::create('room_bans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('banned_by')->constrained('users')->cascadeOnDelete();
            $table->timestamp('banned_at');
            $table->timestamps();
            $table->unique(['room_id', 'user_id']);
        });
    }

    private function migrateLegacyRooms(): void
    {
        if (! Schema::hasColumn('rooms', 'room_code')) {
            return;
        }

        $rooms = DB::table('rooms')->get();
        $roomToServer = [];

        foreach ($rooms as $room) {
            $serverId = DB::table('servers')->insertGetId([
                'name' => $room->name,
                'invite_code' => $room->room_code,
                'password' => $room->password,
                'owner_id' => $room->user_id,
                'credentials_rotated_at' => $room->credentials_rotated_at ?? null,
                'created_at' => $room->created_at,
                'updated_at' => $room->updated_at,
            ]);

            $roomToServer[$room->id] = $serverId;

            DB::table('rooms')->where('id', $room->id)->update([
                'server_id' => $serverId,
                'position' => 0,
            ]);
        }

        if (Schema::hasTable('room_members')) {
            $members = DB::table('room_members')->get();
            foreach ($members as $member) {
                $serverId = $roomToServer[$member->room_id] ?? null;
                if (! $serverId) {
                    continue;
                }

                DB::table('server_members')->updateOrInsert(
                    ['server_id' => $serverId, 'user_id' => $member->user_id],
                    [
                        'role' => $member->role,
                        'joined_at' => $member->joined_at,
                        'created_at' => $member->created_at,
                        'updated_at' => $member->updated_at,
                    ],
                );
            }
        }

        if (Schema::hasTable('room_bans')) {
            $bans = DB::table('room_bans')->get();
            foreach ($bans as $ban) {
                $serverId = $roomToServer[$ban->room_id] ?? null;
                if (! $serverId) {
                    continue;
                }

                DB::table('server_bans')->updateOrInsert(
                    ['server_id' => $serverId, 'user_id' => $ban->user_id],
                    [
                        'banned_by' => $ban->banned_by,
                        'banned_at' => $ban->banned_at,
                        'created_at' => $ban->created_at,
                        'updated_at' => $ban->updated_at,
                    ],
                );
            }
        }
    }
};
