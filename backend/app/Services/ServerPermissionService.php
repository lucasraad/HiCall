<?php

namespace App\Services;

use App\Models\Role;
use App\Models\Server;
use App\Models\ServerMember;
use App\Models\User;

class ServerPermissionService
{
    /**
     * @return array<string, bool>
     */
    public function snapshot(?Server $server, ?User $user): array
    {
        if (! $server || ! $user) {
            return $this->empty();
        }

        if ($this->isPrivileged($server, $user)) {
            return $this->privileged();
        }

        $membership = $this->membership($server, $user);

        if (! $membership) {
            return $this->empty();
        }

        $role = $membership->relationLoaded('assignedRole')
            ? $membership->assignedRole
            : $membership->assignedRole()->first();

        if (! $role) {
            return $this->empty();
        }

        return $this->fromRole($role);
    }

    public function isPrivileged(Server $server, User $user): bool
    {
        return $user->isAdmin() || $server->owner_id === $user->id;
    }

    public function can(Server $server, User $user, string $flag): bool
    {
        return (bool) ($this->snapshot($server, $user)[$flag] ?? false);
    }

    public function isDenied(Server $server, User $user, string $flag): bool
    {
        if ($this->isPrivileged($server, $user)) {
            return false;
        }

        return $this->can($server, $user, $flag);
    }

    public function assertCan(Server $server, User $user, string $flag, string $message): void
    {
        if (! $this->can($server, $user, $flag)) {
            abort(403, $message);
        }
    }

    public function assertNotDenied(Server $server, User $user, string $flag, string $message): void
    {
        if ($this->isDenied($server, $user, $flag)) {
            abort(403, $message);
        }
    }

    public function canManageRoles(Server $server, User $user): bool
    {
        return $this->isPrivileged($server, $user);
    }

    public function assertCanManageRoles(Server $server, User $user): void
    {
        if (! $this->canManageRoles($server, $user)) {
            abort(403, 'Somente o dono do servidor ou um admin da plataforma pode gerenciar cargos.');
        }
    }

    public function canModerateTarget(Server $server, User $actor, User $target): bool
    {
        if ($actor->id === $target->id) {
            return false;
        }

        if ($target->id === $server->owner_id || $target->isAdmin()) {
            return false;
        }

        if ($this->isPrivileged($server, $actor)) {
            return true;
        }

        $actorMember = $this->membership($server, $actor);
        $targetMember = $this->membership($server, $target);

        return $actorMember !== null && $targetMember !== null
            && (int) ($actorMember->assignedRole?->position ?? 0)
                > (int) ($targetMember->assignedRole?->position ?? 0);
    }

    /**
     * @return array<string, bool>
     */
    public function empty(): array
    {
        return [
            'can_create_channels' => false,
            'can_kick_call' => false,
            'can_kick_server' => false,
            'can_ban_server' => false,
            'can_mute_call' => false,
            'deny_screen' => false,
            'deny_camera' => false,
            'deny_voice' => false,
            'deny_chat' => false,
            'can_manage_roles' => false,
            'can_manage_server' => false,
        ];
    }

    /**
     * @return array<string, bool>
     */
    public function privileged(): array
    {
        return [
            'can_create_channels' => true,
            'can_kick_call' => true,
            'can_kick_server' => true,
            'can_ban_server' => true,
            'can_mute_call' => true,
            'deny_screen' => false,
            'deny_camera' => false,
            'deny_voice' => false,
            'deny_chat' => false,
            'can_manage_roles' => true,
            'can_manage_server' => true,
        ];
    }

    /**
     * @return array<string, bool>
     */
    private function fromRole(Role $role): array
    {
        $flags = $this->empty();

        foreach (Role::FLAGS as $flag) {
            $flags[$flag] = (bool) $role->{$flag};
        }

        return $flags;
    }

    private function membership(Server $server, User $user): ?ServerMember
    {
        if ($server->relationLoaded('members')) {
            $match = $server->members->firstWhere('user_id', $user->id);

            if ($match instanceof ServerMember) {
                return $match;
            }
        }

        return ServerMember::query()
            ->with('assignedRole')
            ->where('server_id', $server->id)
            ->where('user_id', $user->id)
            ->first();
    }
}
