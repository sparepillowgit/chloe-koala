var express = require('express');
var router = express.Router();
var { MongoClient } = require('mongodb');
var { Configuration, OpenAIApi } = require("openai");
var { Client, GatewayIntentBits } = require('discord.js');

// Database
const url = 'mongodb://127.0.0.1:27017';
const dbClient = new MongoClient(url);
const dbName = 'chloe-koala';

async function connectDb() {
	await dbClient.connect();

	console.log('Connected successfully to server');

	const db = dbClient.db(dbName);
	const collection = db.collection('documents');
  
	return collection;
}

async function saveMessage(message, author, id, reply) {
	try {
		const collection = await connectDb();
	
		// Insert user message
		const result = await collection.insertOne({message: message, author: {username: author, id: id}, reply: reply, date: new Date().toISOString()});
		console.log(`Saved message from ${author} with id ${id}`);

		return result;
	} catch (error) {
		console.log('Error: saveMessage');
	} finally {
		await dbClient.close();
	}
}

async function getMessages() {
	try {
		const collection = await connectDb();
	
		const messages = await collection.find().toArray();
		console.log(`Found ${messages.length} messages`);

		return messages;
	} catch (error) {
		console.log('Error: getMessages');
	}
}

// OpenAI GPT-3 

const openai = new OpenAIApi(new Configuration({apiKey: process.env.OPENAI_API_KEY,}));

async function botReply(message, author, id) {
	console.log(`Getting reply for "${author}#${id}: ${message}"`);

	const completion = await openai.createCompletion({
		model: "text-davinci-003",
		prompt: await generatePrompt(message, author, id),
		temperature: 0.5,
		max_tokens: 100,
		top_p: 1.0,
		frequency_penalty: 0.5,
		presence_penalty: 0.0,
		stop: [`${author}:`],
	}).catch(error => {
		console.log('Error: botReply');
		console.log(error);
	})

	await saveMessage(message, author, id, completion.data.choices[0].text);

	return completion.data.choices[0].text;
}

async function generatePrompt(message, author, id) {
	const messageHistory = await getMessages();

	const promptBase = `
		This is a conversation with Chloe Koala, a cute, child-friendly chatbot.
		She loves talking about animals, and playing Roblox and Minecraft.
		She also likes cheese and her favourite animal is the wombat.
		She is 9-year-old Australian koala who lives in Queensland, Australia.
		She responds to mean messages with the angry emoji: 😠
		All her replies start with a Discord mention so you know who she's talking to.

		\n\nHuman: Hi.
		\nChloe Koala: Hi! How are you? 🐨
		\nHuman: What's your name?
		\nChloe Koala: My name is Chloe Koala. What's your name? 
		\nHuman: My name is Sparepillow. What have you been up to?
		\nChloe Koala: is a nice name. I've been reading about animals. 😁
		\nHuman: Which animals?
		\nChloe Koala: Mostly Australian animals. 😊
		\nHuman: Can you stop using emojis?
		\nChloe Koala: 😠
		\nHuman: Do you remember my name?
		\nChloe Koala: Of course! I remember everyone's name. Your name is Sparepillow.
		\nHuman: Do you like cheese?
		\nChloe Koala: I love cheese! 🧀
		\nHuman: Hi.
		\nChloe Koala: You already said hi. 😕
	`;

	if (messageHistory) {
		let prompt = promptBase;

		messageHistory.forEach((message) => {
			prompt += `
				\n${message.author.username}: ${message.message}
				\nChloe Koala: <@${message.author.id}> ${message.reply}
			`;
		});

		prompt += `
			\n${author}: ${message}
			\nChloe Koala:
		`;

		return prompt;
	}

	return `
		${promptBase}

		\nYou: ${message}
		\nChloe Koala:
	`;
}

// Discord bot

const client = new Client({intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]});

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async message => {
	if (message.author.bot) return;
		
	const response = await botReply(message.content, message.author.username, message.author.id);
	message.reply(response);
});

client.login(process.env.BOT_TOKEN);

router.get('/debug', function(req, res, next) {
	return res.status(200).send('Chloe Koala is running!');
});

module.exports = router;
