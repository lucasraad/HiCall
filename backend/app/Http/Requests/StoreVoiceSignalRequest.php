<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreVoiceSignalRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'to_user_id' => ['required', 'integer', 'exists:users,id'],
            'type' => ['required', Rule::in(['offer', 'answer', 'ice', 'screen'])],
            'payload' => ['required', 'array'],
        ];
    }
}
