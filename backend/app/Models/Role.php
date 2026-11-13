<?php

namespace App\Models;

use Database\Factories\RoleFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Role extends Model
{
    /** @use HasFactory<RoleFactory> */
    use HasFactory;

    /**
     * @var list<string>
     */
    public const FLAGS = [
        'can_create_channels',
        'can_kick_call',
        'can_kick_server',
        'can_ban_server',
        'can_mute_call',
        'deny_screen',
        'deny_camera',
        'deny_voice',
        'deny_chat',
    ];

    /**
     * @var list<string>
     */
    protected $fillable = [
        'server_id',
        'name',
        'position',
        'can_create_channels',
        'can_kick_call',
        'can_kick_server',
        'can_ban_server',
        'can_mute_call',
        'deny_screen',
        'deny_camera',
        'deny_voice',
        'deny_chat',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'position' => 'integer',
            'can_create_channels' => 'boolean',
            'can_kick_call' => 'boolean',
            'can_kick_server' => 'boolean',
            'can_ban_server' => 'boolean',
            'can_mute_call' => 'boolean',
            'deny_screen' => 'boolean',
            'deny_camera' => 'boolean',
            'deny_voice' => 'boolean',
            'deny_chat' => 'boolean',
        ];
    }

    /**
     * @return BelongsTo<Server, $this>
     */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    /**
     * @return HasMany<ServerMember, $this>
     */
    public function members(): HasMany
    {
        return $this->hasMany(ServerMember::class);
    }
}
