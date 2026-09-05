export interface CollectionSetupFields {
  readonly name: string;
  readonly taskId: string;
  readonly instruction: string;
  readonly exoskeletonDeviceId: string;
  readonly questDeviceId: string;
  readonly headCameraDeviceId: string;
  readonly externalCameraDeviceId: string;
}

export type CollectionSetupErrors = Partial<Record<keyof CollectionSetupFields, string>>;

export function validateCollectionSetup(fields: CollectionSetupFields): CollectionSetupErrors {
  const errors: CollectionSetupErrors = {};
  const required = {
    name: '세션 이름을 입력하세요.',
    taskId: '작업 ID를 입력하세요.',
    instruction: '수행할 작업을 입력하세요.',
    exoskeletonDeviceId: '외골격 장치 ID를 입력하세요.',
    questDeviceId: 'Quest 장치 ID를 입력하세요.',
    headCameraDeviceId: '헤드 카메라 ID를 입력하세요.',
  } as const;
  for (const key of Object.keys(required) as (keyof typeof required)[]) {
    if (fields[key].trim() === '') errors[key] = required[key];
  }
  const deviceFields = ['exoskeletonDeviceId', 'questDeviceId', 'headCameraDeviceId', 'externalCameraDeviceId'] as const;
  for (const key of deviceFields) {
    const id = fields[key].trim();
    if (id && deviceFields.some((other) => other !== key && fields[other].trim() === id)) {
      errors[key] = '장치마다 서로 다른 ID를 입력하세요.';
    }
  }
  return errors;
}
