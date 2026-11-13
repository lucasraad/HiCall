<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VoiceSignal extends Model
{
    public const TYPE_OFFER = 'offer';

    public const TYPE_ANSWER = 'answer';

    public const TYPE_ICE = 'ice';

    public const TYPE_SCREEN = 'screen';

    public const TYPE_MODERATION = 'moderation';

    public const UPDATED_AT = null;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'room_id',
        'from_user_id',
        'to_user_id',
        'type',
        'payload',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'created_at' => 'datetime',
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
    public function fromUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'from_user_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function toUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'to_user_id');
    }
}
