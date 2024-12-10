import { v4 as uuidv4 } from "uuid";
import { ic, Server, serverCanisterMethods, StableBTreeMap } from "azle";
import express from "express";

/**
 * `messagesStorage` - it's a key-value datastructure that is used to store messages.
 * {@link StableBTreeMap} is a self-balancing tree that acts as a durable data storage that keeps data across canister upgrades.
 * For the sake of this contract we've chosen {@link StableBTreeMap} as a storage for the next reasons:
 * - `insert`, `get` and `remove` operations have a constant time complexity - O(1)
 * - data stored in the map survives canister upgrades unlike using HashMap where data is stored in the heap and it's lost after the canister is upgraded
 *
 * Brakedown of the `StableBTreeMap(string, Message)` datastructure:
 * - the key of map is a `messageId`
 * - the value in this map is a message itself `Message` that is related to a given key (`messageId`)
 *
 * Constructor values:
 * 1) 0 - memory id where to initialize a map.
 */

/**
    This type represents a message that can be listed on a board.
*/
export default Server(() => {
    // Message class with helper methods
    class Message {
      constructor(
        public id: string,
        public title: string,
        public body: string,
        public attachmentURL: string | null = null,
        public createdAt: Date,
        public updatedAt: Date | null = null
      ) {}
  
      static create(data: Partial<Message>): Message {
        if (!data.title || !data.body) {
          throw new Error("Both 'title' and 'body' are required.");
        }
        return new Message(
          uuidv4(),
          data.title,
          data.body,
          data.attachmentURL || null,
          getCurrentDate()
        );
      }
  
      update(data: Partial<Message>): Message {
        if (data.title !== undefined) this.title = data.title;
        if (data.body !== undefined) this.body = data.body;
        if (data.attachmentURL !== undefined) this.attachmentURL = data.attachmentURL;
        this.updatedAt = getCurrentDate();
        return this;
      }
    }
  
    const messagesStorage = StableBTreeMap<string, Message>(0);
    const app = express();
    app.use(express.json());
  
    // Centralized error response
    const sendError = (res: express.Response, message: string, status = 400) => {
      res.status(status).json({ error: message });
    };
  
    // Routes
    app.post("/messages", (req, res) => {
      try {
        const message = Message.create(req.body);
        messagesStorage.insert(message.id, message);
        res.json(message);
      } catch (error: any) {
        sendError(res, error.message);
      }
    });
  
    app.get("/messages", (req, res) => {
      res.json(messagesStorage.values());
    });
  
    app.get("/messages/:id", (req, res) => {
      const message = messagesStorage.get(req.params.id);
      if (!message) {
        sendError(res, `Message with id=${req.params.id} not found.`, 404);
      } else {
        res.json(message);
      }
    });
  
    app.put("/messages/:id", (req, res) => {
        const messageOpt = messagesStorage.get(req.params.id);
        
        if (!messageOpt || !messageOpt.Some) {
          sendError(res, `Message with id=${req.params.id} not found.`, 404);
          return;
        }
      
        // Safely extract the message from the Option type (Some variant)
        const message = messageOpt.Some;
      
        try {
          const updatedMessage = message.update(req.body);
          messagesStorage.insert(updatedMessage.id, updatedMessage);
          res.json(updatedMessage);
        } catch (error: any) {
          sendError(res, error.message);
        }
      });
  
    app.delete("/messages/:id", (req, res) => {
      const deletedMessage = messagesStorage.remove(req.params.id);
      if (!deletedMessage) {
        sendError(res, `Message with id=${req.params.id} not found.`, 404);
      } else {
        res.json(deletedMessage);
      }
    });
  
    app.get("/messages/search", (req, res) => {
      const query = req.query.query?.toString().toLowerCase();
      if (!query) {
        sendError(res, "Query parameter is required.");
        return;
      }
  
      const results = messagesStorage.values().filter((message) =>
        message.title.toLowerCase().includes(query) ||
        message.body.toLowerCase().includes(query)
      );
  
      res.json(results);
    });
  
    // Utility function to get the current date
    function getCurrentDate(): Date {
      const timestamp = Number(ic.time());
      return new Date(Math.floor(timestamp / 1_000_000));
    }
  
    return app.listen();
  });
  