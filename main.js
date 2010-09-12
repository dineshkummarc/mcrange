#!/usr/bin/env node

/* Copyright 2010 NorthScale, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var sys = require('sys'),
    net = require('net');

// ----------------------------------------------------

var mc_port = 11299;

// ----------------------------------------------------

var items  = {};
var nitems = 0;

var stats = {
  num_conns: 0,
  tot_conns: 0
};

// ----------------------------------------------------

var server = net.createServer(function(stream) {
    stream.setEncoding('binary');

    stream.on('connect', function() {
        stats.num_conns++;
        stats.tot_conns++;
      });
    stream.on('end', function() {
        stream.end();
        stats.num_conns--;
      });

    var leftOver = null;
    var handler = new_cmd;

    stream.on('data', function(data) {
        if (leftOver) {
          data = leftOver + data;
          leftOver = null;
        }

        handler(data);
      });

    function new_cmd(data) {
      while (data != null && data.length > 0) {
        var crnl = data.indexOf('\r\n');
        if (crnl < 0) {
          leftOver = data;
          return;
        }

        var line = data.slice(0, crnl);
        data = data.slice(crnl + 2);

        var parts = line.split(' ');
        var cmd = parts[0];
        if (cmd == 'get') {
          for (var i = 1; i < parts.length; i++) {
            var item = items[parts[i]];
            if (item != null &&
                item.val != null) {
              stream.write('VALUE ' +
                           item.key + ' ' +
                           item.flg + ' ' +
                           item.val.length + '\r\n' +
                           item.val + '\r\n',
                           'binary');
            }
          }
          stream.write('END\r\n', 'binary');
        } else if (cmd == 'set') {
          var item = { key: parts[1],
                       flg: parts[2],
                       exp: parseInt(parts[3]) };
          var nval = parseInt(parts[4]);

          read_more(data);

          function read_more(d) {
            if (d.length < nval + 2) { // "\r\n".length == 2.
              leftOver = d;

              handler = read_more;

              // Break out of new_cmd while loop.
              //
              data = null;
            } else {
              if (items[item.key] == null) {
                nitems++;
              }

              item.val = d.slice(0, nval);
              items[item.key] = item;

              stream.write('STORED\r\n', 'binary');

              if (handler == read_more) {
                handler = new_cmd;

                new_cmd(d.slice(nval + 2));
              } else {
                data = d.slice(nval + 2);
              }
            }
          }
        } else if (cmd == 'delete') {
          var key = parts[1];

          if (items[key] != null) {
            delete items[key];
            nitems--;

            stream.write('DELETED\r\n', 'binary');
          } else {
            stream.write('NOT_FOUND\r\n', 'binary');
          }
        } else if (cmd == 'stats') {
            stream.write('STAT num_conns ' + stats.num_conns + '\r\n', 'binary');
            stream.write('STAT tot_conns ' + stats.tot_conns + '\r\n', 'binary');
            stream.write('STAT curr_items ' + nitems + '\r\n', 'binary');
            stream.write('END\r\n', 'binary');
        } else if (cmd == 'quit') {
          stream.end();
        } else {
          stream.write('CLIENT_ERROR\r\n', 'binary');
        }
      }
    }
  });

server.listen(mc_port);