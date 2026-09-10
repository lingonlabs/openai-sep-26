import 'dotenv/config';
import OpenAI from 'openai';
if(!process.env.OPENAI_API_KEY){console.error('Set OPENAI_API_KEY in the local .env file first. Do not paste it into chat.');process.exit(1);}
try{
  const client=new OpenAI({maxRetries:0,timeout:15000});
  const response=await client.responses.create({model:process.env.OPENAI_MODEL??'gpt-6-astra',reasoning:{effort:'low'},store:false,
    input:'Reply with exactly: API access confirmed.',max_output_tokens:128});
  console.log({status:response.status,model:response.model,text:response.output_text,inputTokens:response.usage?.input_tokens,outputTokens:response.usage?.output_tokens});
  if(response.status!=='completed')process.exitCode=1;
}catch(error){console.error('Live API check failed.',error instanceof OpenAI.APIError?{status:error.status,code:error.code,type:error.type}:{reason:'Connection or configuration error'});process.exitCode=1;}
