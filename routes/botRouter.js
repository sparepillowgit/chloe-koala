var express = require('express');
var router = express.Router();
var { MongoClient } = require('mongodb');
var { Configuration, OpenAIApi } = require("openai");
var { Client, GatewayIntentBits } = require('discord.js');

// Database
const url = 'mongodb://127.0.0.1:27017';
const dbClient = new MongoClient(url);
const dbName = 'chloe-koala';

async function connectDb(collectionName) {
	await dbClient.connect();

	const db = dbClient.db(dbName);
	const collection = db.collection(collectionName);
  
	return collection;
}

async function saveMessage(message, author, reply) {
	try {
		const collection = await connectDb('messages');
	
		// Insert user message
		const result = await collection.insertOne({message: message, author: {username: author}, reply: reply, date: new Date().toISOString()});
		console.log(`Saved message from ${author}`);

		return result;
	} catch (error) {
		console.log('Error: saveMessage');
	} finally {
		await dbClient.close();
	}
}

async function getMessages() {
	try {
		const collection = await connectDb('messages');
	
		const messages = await collection.find().toArray();
		console.log(`Found ${messages.length} messages`);

		return messages;
	} catch (error) {
		console.log('Error: getMessages');
	}
}

async function backupMessages() {
	try {
		console.log('Backing up messages...')

		const collection = await connectDb('backup-messages');
		const messages = await getMessages();

		const backupData = {};

		backupData[`backup-${Math.floor(Date.now() / 1000)}`] = messages;

		await collection.insertOne(backupData);

		console.log(`Backup complete for ${messages.length} messages`);

		return;
	} catch (error) {
		console.log('Error: backupMessages');
	} finally {
		await dbClient.close();
	}
}

async function deleteMessages() {
	try {
		await backupMessages();

		const collection = await connectDb('messages');
	
		await collection.deleteMany({});
		console.log(`Deleted ${result.deletedCount} messages`);

		return;
	} catch (error) {
		console.log('Error: deleteMessages');
	}
}

async function saveSummary(summary) {
	try {
		const collection = await connectDb('summaries');
	
		// Insert user message
		const result = await collection.insertOne({summary: summary, date: new Date().toISOString()});
		console.log(`Saved summary`);

		return result;
	} catch (error) {
		console.log('Error: saveSummary');
	} finally {
		await dbClient.close();
	}
}

async function getSummaries() {
	try {
		const collection = await connectDb('summaries');
	
		const summaries = await collection.find().toArray();
		console.log(`Found ${summaries.length} summaries`);

		return summaries;
	} catch (error) {
		console.log('Error: getSummaries');
	}
}

// OpenAI GPT-3 

const openai = new OpenAIApi(new Configuration({apiKey: process.env.OPENAI_API_KEY,}));

async function botReply(message, author) {
	const completion = await openai.createCompletion({
		model: "text-davinci-003",
		prompt: await generateMessagePrompt(message, author),
		temperature: 0.5,
		max_tokens: 100,
		top_p: 1.0,
		frequency_penalty: 0.5,
		presence_penalty: 0.0,
		stop: [`${author}:`],
	}).catch(error => {
		console.log('Error: botReply');
	})

	await saveMessage(message, author, completion.data.choices[0].text);

	return completion.data.choices[0].text;
}

async function chatSummarise(prompt, summarise) {
	if (!summarise) return;

	console.log(`Summarising conversation`);

	const completion = await openai.createCompletion({
		model: "text-davinci-003",
		prompt: await generateSummaryPrompt(prompt),
		temperature: 0.7,
		max_tokens: 500,
		top_p: 1.0,
		frequency_penalty: 0.0,
		presence_penalty: 1
	}).catch(error => {
		console.log('Error: chatSummarise');
	})

	await saveSummary(completion.data.choices[0].text);
	await deleteMessages();

	return;
}

async function generateSummaryPrompt(conversation) {
	let prompt = '';
		prompt += `Make a very detailed summary of the following conversation:`;
		prompt += `${conversation}`;

	return prompt;
}

async function generateMessagePrompt(message, author) {
	const messageHistory = await getMessages();
	let promptBase = '';

	promptBase += `This is a conversation with Chloe Koala, a cute, child-friendly chatbot. `;
	promptBase += `She is 9-year-old Australian koala who lives in Queensland, Australia. `;
	promptBase += `She doesn't know she's an AI or chatbot. `;
	promptBase += `She is a vegetarian and loves animals. Her favourite animal is the wombat and her favourite food is cheese.`;
	promptBase += `She is a little stubborn and she responds to mean messages with angry emojis 😠`;
	promptBase += `\n\nYou: Hi.`;
	promptBase += `\nChloe Koala: Hi! I'm Chloe. I'm 9 years old. 🐨`;
	promptBase += `\nYou: What are your hobbies?`;
	promptBase += `\nChloe Koala: I like learning about animals, and playing Minecraft and Roblox. 😊`;
	promptBase += `\nYou: Do you like cheese?`;
	promptBase += `\nChloe Koala: I love cheese! 🧀`;
	promptBase += `\nYou: You should go to sleep now.`;
	promptBase += `\nChloe Koala: I don't want to sleep! 😠`;

	let prompt = promptBase;

	if (messageHistory.length > 0) {
		messageHistory.forEach((message) => {
			prompt += `\n${message.author.username}: ${message.message}`;

			if (message.reply.trim().substring(0, 2) === '<@') {
				prompt += `\nChloe Koala: ${message.reply}`;
			} else {
				prompt += `\nChloe Koala: ${message.reply}`;
			}
		});

		prompt += `\n${author}: ${message}`;
	} else {
		prompt += `\nHuman: ${message}`;
	}

	const summaries = await getSummaries();

	if (prompt.length > 3000 || summaries.length > 0) {
		prompt += '\n\n[End of conversation]';

		await chatSummarise(prompt, prompt.length > 3000);

		prompt = '';

		summaries.forEach((summary) => {
			prompt += `\n\n${summary.summary}`;
		})

		prompt += `\n\n[The conversation resumes]`;

		messageHistory.splice(0, messageHistory.length - 10);

		messageHistory.forEach((message) => {
			prompt += `\n${message.author.username}: ${message.message}`;

			if (message.reply.trim().substring(0, 2) === '<@') {
				prompt += `\nChloe Koala: ${message.reply}`;
			} else {
				prompt += `\nChloe Koala: ${message.reply}`;
			}
		});
		
		prompt += `${author}: ${message}`;
	}

	prompt += `\nChloe Koala:`;

	console.log(`Prompt length: ${prompt.length} characters`);

	return prompt;
}

// Discord bot

const client = new Client({intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]});

client.on('ready', () => {
	console.log(`${client.user.tag} has successfully logged into Discord!`);
});

client.on('messageCreate', async message => {
	if (message.author.bot) return;
		
	const response = await botReply(message.content.trim(), message.author.username);
	message.reply(response.trim());
});

client.login(process.env.BOT_TOKEN);

router.get('/debug', function(req, res, next) {
	return res.status(200).send('Chloe Koala is running!');
});

module.exports = router;
