
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { weatherWorkflow } from './workflows/weather-workflow';
import { planObservationWorkflow } from './workflows/plan-observation-workflow';
import { weatherAgent } from './agents/weather-agent';
import { stargazerAgent } from './agents/stargazer-agent';

export const mastra = new Mastra({
  workflows: { weatherWorkflow, planObservationWorkflow },
  agents: { weatherAgent, stargazerAgent },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
});
