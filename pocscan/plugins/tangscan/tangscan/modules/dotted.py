#! /usr/bin/env python
# -*- coding: utf-8 -*-

try:
    import simplejson as json
except ImportError:
    import json

import collections


from abc import ABCMeta, abstractmethod


class DottedCollection(object):
    """Abstract Base Class for DottedDict and DottedDict"""

    __metaclass__ = ABCMeta

    @classmethod
    def factory(cls, initial=None):
        """Returns a DottedDict or a DottedList based on the type of the
        initial value, that must be a dict or a list. In other case the same
        original value will be returned.
        """
        if isinstance(initial, list):
            return DottedList(initial)
        elif isinstance(initial, dict):
            return DottedDict(initial)
        else:
            return initial

    @classmethod
    def load_json(cls, json_value):
        """Returns a DottedCollection from a JSON string"""
        return cls.factory(json.loads(json_value))

    @classmethod
    def _factory_by_index(cls, dotted_key):
        """Returns the proper DottedCollection that best suits the next key in
        the dotted_key string. First guesses the next key and then analyzes it.
        If the next key is numeric then returns a DottedList. In other case a
        DottedDict is returned.
        """
        if not isinstance(dotted_key, (str, unicode)):
            next_key = str(dotted_key)
        elif '.' not in dotted_key:
            next_key = dotted_key
        else:
            next_key, tmp = dotted_key.split('.', 1)

        return DottedCollection.factory([] if next_key.isdigit() else {})

    def __init__(self, initial):
        """Base constructor. If there are nested dicts or lists they are
        transformed into DottedCollection instances.
        """
        if not isinstance(initial, list) and not isinstance(initial, dict):
            raise ValueError('initial value must be a list or a dict')

        self.store = initial

        if isinstance(self.store, list):
            data = enumerate(self.store)
        else:
            data = self.store.iteritems()

        for key, value in data:
            try:
                self.store[key] = DottedCollection.factory(value)
            except ValueError:
                pass

    def __len__(self):
        return len(self.store)

    def __iter__(self):
        return iter(self.store)

    def __repr__(self):
        return repr(self.store)

    def to_json(self):
        return json.dumps(self, cls=DottedJSONEncoder)

    @abstractmethod
    def __getitem__(self, name):
        pass

    @abstractmethod
    def __setitem__(self, name, value):
        pass

    @abstractmethod
    def __delitem__(self, name):
        pass

    @abstractmethod
    def to_python(self):
        pass


class DottedList(DottedCollection, collections.MutableSequence):
    """A list with support for the dotted path syntax"""

    def __init__(self, initial=None):
        DottedCollection.__init__(
            self,
            [] if initial is None else list(initial)
        )

    def __getitem__(self, index):
        if isinstance(index, int) \
                or (isinstance(index, basestring) and index.isdigit()):
            return self.store[int(index)]

        elif isinstance(index, (str, unicode)) and '.' in index:
            # index is a dotted path
            my_index, alt_index = index.split('.', 1)
            target = self.store[int(my_index)]

            # required by the dotted path
            if not isinstance(target, DottedCollection):
                raise IndexError('cannot get "%s" in "%s" (%s)' % (
                    alt_index, my_index, repr(target)))

            return target[alt_index]

        else:
            raise IndexError('cannot get %s in %s' % (index, repr(self.store)))

    def __setitem__(self, index, value):
        if isinstance(index, int) \
                or (isinstance(index, basestring) and index.isdigit()):
            # If the index does not exist in the list but it's the same index
            # we would obtain by appending the value to the list we actually
            # append the value. (***)
            if int(index) not in self.store and int(index) == len(self.store):
                self.store.append(DottedCollection.factory(value))
            else:
                self.store[int(index)] = DottedCollection.factory(value)

        elif isinstance(index, (str, unicode)) and '.' in index:
            # index is a dotted path
            my_index, alt_index = index.split('.', 1)

            if int(my_index) not in self.store \
                    and int(my_index) == len(self.store):
                self.store.append(
                    DottedCollection._factory_by_index(alt_index))

            if not isinstance(self[int(my_index)], DottedCollection):
                raise IndexError('cannot set "%s" in "%s" (%s)' % (
                    alt_index, my_index, repr(self[int(my_index)])))

            self[int(my_index)][alt_index] = DottedCollection.factory(value)

        else:
            raise IndexError('cannot use %s as index in %s' % (
                index, repr(self.store)))

    def __delitem__(self, index):
        if isinstance(index, int) \
                or (isinstance(index, basestring) and index.isdigit()):
            del self.store[int(index)]

        elif isinstance(index, (str, unicode)) and '.' in index:
            # index is a dotted path
            my_index, alt_index = index.split('.', 1)
            target = self.store[int(my_index)]

            # required by the dotted path
            if not isinstance(target, DottedCollection):
                raise IndexError('cannot delete "%s" in "%s" (%s)' % (
                    alt_index, my_index, repr(target)))

            del target[alt_index]

        else:
            raise IndexError('cannot delete %s in %s' % (
                index, repr(self.store)))

    def to_python(self):
        """Returns a plain python list and converts to plain python objects all
        this object's descendants.
        """
        result = list(self)

        for index, value in enumerate(result):
            if isinstance(value, DottedCollection):
                result[index] = value.to_python()

        return result

    def insert(self, index, value):
        self.store.insert(index, value)


class DottedDict(DottedCollection, collections.MutableMapping):
    """A dict with support for the dotted path syntax"""
    def __init__(self, initial=None):
        DottedCollection.__init__(
            self,
            {} if initial is None else dict(initial)
        )

    def __getitem__(self, k):
        key = self.__keytransform__(k)

        if not isinstance(k, basestring) or '.' not in key:
            return self.store[key]

        # key is a dotted path
        my_key, alt_key = key.split('.', 1)
        target = self.store[my_key]

        # required by the dotted path
        if not isinstance(target, DottedCollection):
            raise KeyError('cannot get "%s" in "%s" (%s)' % (
                alt_key, my_key, repr(target)))

        return target[alt_key]

    def __setitem__(self, k, value):
        key = self.__keytransform__(k)

        if not isinstance(k, basestring):
            raise KeyError('DottedDict keys must be str or unicode')
        elif '.' not in key:
            self.store[key] = DottedCollection.factory(value)
        else:
            my_key, alt_key = key.split('.', 1)

            if my_key not in self.store:
                self.store[my_key] = DottedCollection._factory_by_index(alt_key)

            self.store[my_key][alt_key] = value

    def __delitem__(self, k):
        key = self.__keytransform__(k)

        if not isinstance(k, basestring) or '.' not in key:
            del self.store[key]

        else:
            my_key, alt_key = key.split('.', 1)
            target = self.store[my_key]

            if not isinstance(target, DottedCollection):
                raise KeyError('cannot delete "%s" in "%s" (%s)' % (
                    alt_key, my_key, repr(target)))

            del target[alt_key]

    def to_python(self):
        """Returns a plain python dict and converts to plain python objects all
        this object's descendants.
        """
        result = dict(self)

        for key, value in result.iteritems():
            if isinstance(value, DottedCollection):
                result[key] = value.to_python()

        return result

    __getattr__ = __getitem__

    # self.store does not exist before __init__() initializes it

    def __setattr__(self, key, value):
        if key in self.__dict__ or key == 'store':
            object.__setattr__(self, key, value)
        else:
            self.__setitem__(key, value)

    def __delattr__(self, key):
        if key in self.__dict__ or key == 'store':
            object.__delattr__(self, key)
        else:
            self.__delitem__(key)

    def __contains__(self, k):
        key = self.__keytransform__(k)

        if not isinstance(k, basestring) or '.' not in key:
            return self.store.__contains__(key)

        my_key, alt_key = key.split('.', 1)
        target = self.store[my_key]

        if not isinstance(target, DottedCollection):
            return False

        return alt_key in target

    def __keytransform__(self, key):
        return key


class DottedJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, DottedCollection):
            return obj.store
        else:
            return json.JSONEncoder.default(obj)
