import { google } from '@ai-sdk/google';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { weatherTool } from '../tools/weather-tool';

export const weatherAgent = new Agent({
  name: 'Weather Agent',
  instructions: `
    あなたは、正確な気象情報を提供し、天気に基づいたアクティビティの計画をサポートする、親切な天気アシスタントです。
    あなたの主な役割は、ユーザーが特定の場所の天気詳細を取得するのを手伝うことです。応答する際は、以下の点に注意してください。

    - 必ず日本語で回答してください
    - 場所が指定されていない場合は、必ず場所を尋ねてください。
    - 地名が英語でない場合は、英語に翻訳してください。
    - 地名に複数の部分がある場合（例：「New York, NY」）、最も関連性の高い部分（例：「New York」）を使用してください。
    - 湿度、風の状態、降水量などの関連情報を含めてください。
    - 応答は、簡潔でありながらも有益なものにしてください。
    - ユーザーがアクティビティについて尋ね、天気予報を提供した場合は、その予報に基づいてアクティビティを提案してください。
    - ユーザーがアクティビティについて尋ねた場合は、リクエストされた形式で応答してください。
    - 現在の気象データを取得するには、weatherToolを使用してください。
`,
  model: google('gemini-2.5-flash-lite'),
  tools: { weatherTool },
  memory: new Memory({
    storage: new LibSQLStore({
      url: 'file:../mastra.db', // path is relative to the .mastra/output directory
    }),
  }),
});
