#!/usr/bin/env node

/**
 * Smoke Test Script for AbletonOSC Integration
 *
 * This script validates the OSC client can communicate with Ableton Live
 * via the AbletonOSC plugin. It performs read-only queries that are safe
 * to run against any Live session.
 *
 * Prerequisites:
 * - Ableton Live 12 is running
 * - AbletonOSC plugin is installed and enabled
 * - OSC ports configured (default: send=11001, receive=11000)
 *
 * Exit codes:
 * - 0: All checks passed
 * - 1: Health check failed (Ableton not responding)
 * - 2: Some queries failed
 */

import { OscClient } from '../src/osc-client.js';

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function printHeader() {
  console.log(`\n${colors.bright}${colors.cyan}==============================================`);
  console.log('  AbletonOSC Smoke Test');
  console.log(`==============================================${colors.reset}\n`);
  console.log(`${colors.dim}This script validates OSC communication with`);
  console.log(`Ableton Live 12 via the AbletonOSC plugin.${colors.reset}\n`);
}

function printSuccess(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function printError(message) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function printInfo(message) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

function printTroubleshooting() {
  console.log(`\n${colors.yellow}${colors.bright}Troubleshooting Steps:${colors.reset}`);
  console.log(`${colors.yellow}1.${colors.reset} Ensure Ableton Live 12 is running`);
  console.log(`${colors.yellow}2.${colors.reset} Check that AbletonOSC is installed:`);
  console.log(`   ${colors.dim}macOS: ~/Music/Ableton/User Library/Remote Scripts/AbletonOSC${colors.reset}`);
  console.log(`   ${colors.dim}Linux: Check your Ableton User Library path${colors.reset}`);
  console.log(`${colors.yellow}3.${colors.reset} Verify AbletonOSC is enabled in Live preferences:`);
  console.log(`   ${colors.dim}Preferences → Link/Tempo/MIDI → Control Surface${colors.reset}`);
  console.log(`${colors.yellow}4.${colors.reset} Verify OSC ports (default: send=11001, receive=11000)`);
  console.log(`${colors.yellow}5.${colors.reset} Check firewall settings for UDP port 11000`);
  console.log(`${colors.yellow}6.${colors.reset} Ensure no other process is using the OSC ports\n`);
}

async function runSmokeTest() {
  printHeader();

  const client = new OscClient();
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    queries: []
  };

  try {
    // Try to open the port
    printInfo('Opening OSC client...');
    await client.open();
    printSuccess(`OSC client opened (send=${client.sendPort}, receive=${client.receivePort})`);
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      printError(`Port ${client.receivePort} already in use`);
      printInfo('Another process (possibly another MCP server or test) is using the OSC port');
      printInfo(`Try: lsof -i UDP:${client.receivePort} to find the process`);
      process.exit(1);
    }
    printError(`Failed to open OSC client: ${err.message}`);
    process.exit(1);
  }

  // Run health check
  printInfo('Running health check...');
  const isHealthy = await client.healthCheck();

  if (!isHealthy) {
    printError('Health check failed - AbletonOSC not responding');
    printTroubleshooting();
    await client.close();
    process.exit(1);
  }

  printSuccess('Connected to Ableton Live via AbletonOSC!\n');

  // Define read-only queries to test
  const queries = [
    {
      name: 'Tempo',
      address: '/live/song/get/tempo',
      args: [],
      format: (result) => `${result[0]} BPM`
    },
    {
      name: 'Track Count',
      address: '/live/song/get/num_tracks',
      args: [],
      format: (result) => `${result[0]} tracks`
    },
    {
      name: 'Track 0 Name',
      address: '/live/track/get/name',
      args: [0],
      format: (result) => `"${result[0]}"`
    },
    {
      name: 'Is Playing',
      address: '/live/song/get/is_playing',
      args: [],
      format: (result) => result[0] ? 'Yes' : 'No'
    }
  ];

  printInfo('Running read-only queries...\n');

  // Execute each query and collect results
  for (const query of queries) {
    results.total++;
    try {
      const result = await client.query(query.address, query.args);
      results.passed++;
      results.queries.push({
        name: query.name,
        status: 'PASS',
        value: query.format(result)
      });
    } catch (err) {
      results.failed++;
      const classified = client.classifyError(err);
      results.queries.push({
        name: query.name,
        status: 'FAIL',
        error: `${classified.type}: ${classified.message}`
      });
    }
  }

  // Print results table
  console.log(`${colors.bright}Query Results:${colors.reset}`);
  console.log('─'.repeat(60));
  console.log(`${'Query'.padEnd(20)} ${'Status'.padEnd(10)} ${'Result/Error'.padEnd(30)}`);
  console.log('─'.repeat(60));

  for (const query of results.queries) {
    const statusColor = query.status === 'PASS' ? colors.green : colors.red;
    const statusText = `${statusColor}${query.status}${colors.reset}`;
    const valueText = query.value || query.error || '';
    console.log(`${query.name.padEnd(20)} ${statusText.padEnd(19)} ${valueText}`);
  }

  console.log('─'.repeat(60));

  // Print summary
  console.log(`\n${colors.bright}Summary:${colors.reset}`);
  if (results.failed === 0) {
    printSuccess(`All ${results.total} queries succeeded`);
  } else {
    printError(`${results.failed}/${results.total} queries failed`);
  }

  // Clean up
  await client.close();

  // Exit with appropriate code
  if (results.failed === 0) {
    console.log(`\n${colors.green}${colors.bright}✓ Smoke test passed${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}${colors.bright}✗ Smoke test failed${colors.reset}\n`);
    process.exit(2);
  }
}

// Run the smoke test
runSmokeTest().catch((err) => {
  printError(`Unexpected error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
