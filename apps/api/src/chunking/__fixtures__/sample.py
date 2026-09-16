import json


def greet(name: str) -> str:
    return f"Hello, {name}!"


class Greeter:
    def __init__(self, verbose: bool):
        self.verbose = verbose

    def greet(self, name: str) -> str:
        if self.verbose:
            print(f"Greeting {name}")
        return greet(name)
