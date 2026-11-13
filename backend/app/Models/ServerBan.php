<?php

namespace App\Models;

use Database\Factories\ServerBanFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServerBan extends Model
{
    /** @use HasFactory<ServerBanFactory> */
    use HasFactory;
    /**
     * @var list<string>
     */
    protected $fillable = [
        'server_id',
        'user_id',
        'banned_by',
        'banned_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'banned_at' => 'datetime',
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
}
