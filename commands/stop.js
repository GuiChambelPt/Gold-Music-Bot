const { SlashCommandBuilder } = require('discord.js');
require('dotenv').config()
const queue = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playing and clear the queue'),
  async execute(interaction) {
    if (!interaction.member.voice.channel) {
      return interaction.reply('You have to be in a voice channel to stop the music!');
    }
    
    const serverQueue = queue.get(interaction.guildId);
    if (!serverQueue) {
      return interaction.reply('There is no song playing!');
    }
    
    serverQueue.songs = [];
    serverQueue.connection.destroy();
    queue.delete(interaction.guildId);
    interaction.reply('Stopped the music and left the voice channel!');
  },
};