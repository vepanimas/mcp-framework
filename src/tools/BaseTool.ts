import { z } from "zod";
import { Tool as SDKTool } from "@modelcontextprotocol/sdk/types.js";
import { ImageContent } from "../transports/utils/image-handler.js";

export type ToolInputSchema<T> = {
  [K in keyof T]: {
    type: z.ZodType<T[K]>;
    description: string;
  };
};

export type ToolInput<T extends ToolInputSchema<any>> = {
  [K in keyof T]: z.infer<T[K]["type"]>;
};

export type TextContent = {
  type: "text";
  text: string;
};

export type ErrorContent = {
  type: "error";
  text: string;
};

export type ToolContent = TextContent | ErrorContent | ImageContent;

export type ToolResponse = {
  content: ToolContent[];
};

export interface ToolProtocol extends SDKTool {
  name: string;
  description: string;
  toolDefinition: {
    name: string;
    description: string;
    inputSchema: {
      type: "object";
      properties?: Record<string, unknown>;
      required?: string[];
    };
  };
  toolCall(request: {
    params: { name: string; arguments?: Record<string, unknown> };
  }): Promise<ToolResponse>;
}

export abstract class MCPTool<TInput extends Record<string, any> = {}>
  implements ToolProtocol
{
  abstract name: string;
  abstract description: string;
  protected abstract schema: ToolInputSchema<TInput>;
  protected useStringify: boolean = true;
  [key: string]: unknown;

  get inputSchema(): { type: "object"; properties?: Record<string, unknown>; required?: string[] } {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    Object.entries(this.schema).forEach(([key, schema]) => {
      // Determine the correct JSON schema type (unwrapping optional if necessary)
      const jsonType = this.getJsonSchemaType(schema.type);
      properties[key] = {
        type: jsonType,
        description: schema.description,
      };

      // If the field is not an optional, add it to the required array.
      if (!(schema.type instanceof z.ZodOptional)) {
        required.push(key);
      }
    });

    const inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] } = {
      type: "object",
      properties,
    };

    if (required.length > 0) {
      inputSchema.required = required;
    }

    return inputSchema;
  }

  get toolDefinition() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
    };
  }

  protected abstract execute(input: TInput): Promise<unknown>;

  async toolCall(request: {
    params: { name: string; arguments?: Record<string, unknown> };
  }): Promise<ToolResponse> {
    try {
      const args = request.params.arguments || {};
      const validatedInput = await this.validateInput(args);
      const result = await this.execute(validatedInput);
      return this.createSuccessResponse(result);
    } catch (error) {
      return this.createErrorResponse(error as Error);
    }
  }

  private async validateInput(args: Record<string, unknown>): Promise<TInput> {
    const zodSchema = z.object(
      Object.fromEntries(
        Object.entries(this.schema).map(([key, schema]) => [key, schema.type])
      )
    );

    return zodSchema.parse(args) as TInput;
  }

  private getJsonSchemaType(zodType: z.ZodType<any>): string {
    // Unwrap optional types to correctly determine the JSON schema type.
    let currentType = zodType;
    if (currentType instanceof z.ZodOptional) {
      currentType = currentType.unwrap();
    }

    if (currentType instanceof z.ZodString) return "string";
    if (currentType instanceof z.ZodNumber) return "number";
    if (currentType instanceof z.ZodBoolean) return "boolean";
    if (currentType instanceof z.ZodArray) return "array";
    if (currentType instanceof z.ZodObject) return "object";
    return "string";
  }

  protected createSuccessResponse(data: unknown): ToolResponse {
    if (this.isImageContent(data)) {
      return {
        content: [data],
      };
    }

    if (Array.isArray(data)) {
      const validContent = data.filter(item => this.isValidContent(item)) as ToolContent[];
      if (validContent.length > 0) {
        return {
          content: validContent,
        };
      }
    }

    return {
      content: [{ 
        type: "text", 
        text: this.useStringify ? JSON.stringify(data) : String(data) 
      }],
    };
  }

  protected createErrorResponse(error: Error): ToolResponse {
    return {
      content: [{ type: "error", text: error.message }],
    };
  }

  private isImageContent(data: unknown): data is ImageContent {
    return (
      typeof data === "object" &&
      data !== null &&
      "type" in data &&
      data.type === "image" &&
      "data" in data &&
      "mimeType" in data &&
      typeof (data as ImageContent).data === "string" &&
      typeof (data as ImageContent).mimeType === "string"
    );
  }

  private isTextContent(data: unknown): data is TextContent {
    return (
      typeof data === "object" &&
      data !== null &&
      "type" in data &&
      data.type === "text" &&
      "text" in data &&
      typeof (data as TextContent).text === "string"
    );
  }

  private isErrorContent(data: unknown): data is ErrorContent {
    return (
      typeof data === "object" &&
      data !== null &&
      "type" in data &&
      data.type === "error" &&
      "text" in data &&
      typeof (data as ErrorContent).text === "string"
    );
  }

  private isValidContent(data: unknown): data is ToolContent {
    return (
      this.isImageContent(data) ||
      this.isTextContent(data) ||
      this.isErrorContent(data)
    );
  }

  protected async fetch<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
}
