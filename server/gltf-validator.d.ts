declare module "gltf-validator" {
  const validator: {
    validateBytes(
      bytes: Uint8Array,
      options: {
        maxIssues: number;
        ignoredIssues: string[];
        externalResourceFunction(uri: string): Promise<Uint8Array>;
      },
    ): Promise<{
      issues: {
        numErrors: number;
        truncated: boolean;
        numWarnings: number;
        messages: { severity: number; message: string }[];
      };
    }>;
  };
  export default validator;
}
