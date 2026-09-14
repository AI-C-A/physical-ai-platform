export interface CollectionSetupFields {
  readonly name: string;
  readonly instruction: string;
}

export type CollectionSetupErrors = Partial<Record<keyof CollectionSetupFields, string>>;

export function validateCollectionSetup(fields: CollectionSetupFields): CollectionSetupErrors {
  const errors: CollectionSetupErrors = {};
  const required = {
    name: '세션 이름을 입력하세요.',
    instruction: '수행할 작업을 입력하세요.',
  } as const;
  for (const key of Object.keys(required) as (keyof typeof required)[]) {
    if (fields[key].trim() === '') errors[key] = required[key];
  }
  return errors;
}
