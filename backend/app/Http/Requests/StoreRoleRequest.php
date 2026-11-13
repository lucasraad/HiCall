<?php

namespace App\Http\Requests;

use App\Models\Role;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreRoleRequest extends FormRequest
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
        $server = $this->route('server');

        return [
            'name' => [
                'required',
                'string',
                'max:80',
                Rule::unique('roles', 'name')->where(fn ($query) => $query->where('server_id', $server?->id)),
            ],
            'position' => ['sometimes', 'integer', 'min:1', 'max:1000'],
            ...$this->flagRules(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function flagRules(): array
    {
        $rules = [];

        foreach (Role::FLAGS as $flag) {
            $rules[$flag] = ['sometimes', 'boolean'];
        }

        return $rules;
    }
}
