<?php

namespace App\Models;

use Database\Factories\VoicePeerFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VoicePeer extends Model
{
    /** @use HasFactory<VoicePeerFactory> */
    use HasFactory;

    public const STALE_SECONDS = 45;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'room_id',
        'user_id',
        'sharing_screen',
        'camera_on',
        'force_muted',
        'last_seen_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'sharing_screen' => 'boolean',
            'camera_on' => 'boolean',
            'force_muted' => 'boolean',
            'last_seen_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Channel, $this>
     */
    public function channel(): BelongsTo
    {
        return $this->belongsTo(Channel::class, 'room_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
