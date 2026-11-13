<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public const ROLE_ADMIN = 'admin';

    public const ROLE_USER = 'user';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'is_banned',
        'banned_at',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_banned' => 'boolean',
            'banned_at' => 'datetime',
        ];
    }

    public function isAdmin(): bool
    {
        return $this->role === self::ROLE_ADMIN;
    }

    /**
     * @return HasMany<Server, $this>
     */
    public function ownedServers(): HasMany
    {
        return $this->hasMany(Server::class, 'owner_id');
    }

    /**
     * @return BelongsToMany<Server, $this>
     */
    public function servers(): BelongsToMany
    {
        return $this->belongsToMany(Server::class, 'server_members')
            ->withPivot(['role', 'role_id', 'joined_at'])
            ->withTimestamps();
    }

    /**
     * @return HasMany<ServerMember, $this>
     */
    public function serverMemberships(): HasMany
    {
        return $this->hasMany(ServerMember::class);
    }
}
