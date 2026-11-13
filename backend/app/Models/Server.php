<?php

namespace App\Models;

use Database\Factories\ServerFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Server extends Model
{
    /** @use HasFactory<ServerFactory> */
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'invite_code',
        'password',
        'owner_id',
        'credentials_rotated_at',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'password',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'credentials_rotated_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    /**
     * @return HasMany<Channel, $this>
     */
    public function channels(): HasMany
    {
        return $this->hasMany(Channel::class)->orderBy('position');
    }

    /**
     * @return HasMany<ServerMember, $this>
     */
    public function members(): HasMany
    {
        return $this->hasMany(ServerMember::class);
    }

    /**
     * @return BelongsToMany<User, $this>
     */
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'server_members')
            ->withPivot(['role', 'role_id', 'joined_at'])
            ->withTimestamps();
    }

    /**
     * @return HasMany<Role, $this>
     */
    public function roles(): HasMany
    {
        return $this->hasMany(Role::class);
    }

    /**
     * @return HasMany<ServerBan, $this>
     */
    public function bans(): HasMany
    {
        return $this->hasMany(ServerBan::class);
    }

    public function isBannedUser(int $userId): bool
    {
        return $this->bans()->where('user_id', $userId)->exists();
    }
}
