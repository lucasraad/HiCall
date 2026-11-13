<?php

namespace App\Services;

use App\Models\Server;
use App\Models\ServerMember;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class ServerCredentialService
{
    /**
     * @return array{invite_code: string, password: string}
     */
    public function rotate(Server $server): array
    {
        $plainPassword = Str::password(12, symbols: false);

        $server->update([
            'invite_code' => $this->generateUniqueInviteCode(),
            'password' => Hash::make($plainPassword),
            'credentials_rotated_at' => now(),
        ]);

        return [
            'invite_code' => $server->invite_code,
            'password' => $plainPassword,
        ];
    }

    public function generateUniqueInviteCode(): string
    {
        do {
            $code = strtoupper(Str::random(8));
        } while (Server::query()->where('invite_code', $code)->exists());

        return $code;
    }

    public function addOwnerMembership(Server $server, int $userId): void
    {
        ServerMember::query()->updateOrCreate(
            [
                'server_id' => $server->id,
                'user_id' => $userId,
            ],
            [
                'role' => ServerMember::ROLE_OWNER,
                'joined_at' => now(),
            ],
        );
    }

    public function addMember(Server $server, int $userId): void
    {
        if ($server->owner_id === $userId) {
            $this->addOwnerMembership($server, $userId);

            return;
        }

        ServerMember::query()->updateOrCreate(
            [
                'server_id' => $server->id,
                'user_id' => $userId,
            ],
            [
                'role' => ServerMember::ROLE_MEMBER,
                'joined_at' => now(),
            ],
        );
    }
}
