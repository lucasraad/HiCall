<?php

namespace App\Models;

use Database\Factories\ServerMemberFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServerMember extends Model
{
    /** @use HasFactory<ServerMemberFactory> */
    use HasFactory;
    public const ROLE_OWNER = 'owner';

    public const ROLE_MEMBER = 'member';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'server_id',
        'user_id',
        'role',
        'role_id',
        'joined_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'joined_at' => 'datetime',
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
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Role, $this>
     */
    public function assignedRole(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'role_id');
    }
}
