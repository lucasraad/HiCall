<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AssignMemberRoleRequest extends FormRequest
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
            'role_id' => ['nullable', 'integer', 'exists:roles,id'],
        ];
    }
}
